import { ROLES, createDeck, shuffle } from "./roles.js";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function roomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function createInfluence(role) {
  return {
    id: uid(),
    role,
    revealed: false,
  };
}

function isPlayerAlive(player) {
  return player.influences.some((inf) => !inf.revealed);
}

function getPlayer(room, playerId) {
  return room.players.find((p) => p.id === playerId);
}

function livingPlayers(room) {
  return room.players.filter(isPlayerAlive);
}

function activePlayer(room) {
  return room.players[room.currentTurnIndex];
}

function nextLivingPlayerIndex(room, startIndex) {
  for (let offset = 1; offset <= room.players.length; offset += 1) {
    const idx = (startIndex + offset) % room.players.length;
    if (isPlayerAlive(room.players[idx])) return idx;
  }
  return startIndex;
}

function drawInfluences(deck, count) {
  const cards = [];
  for (let i = 0; i < count; i += 1) {
    const role = deck.pop();
    if (!role) break;
    cards.push(createInfluence(role));
  }
  return cards;
}

function addLog(room, text) {
  room.log.unshift({ id: uid(), text, at: Date.now() });
  room.log = room.log.slice(0, 40);
}

function removeCoins(player, amount) {
  player.coins = Math.max(0, player.coins - amount);
}

function giveCoins(player, amount) {
  player.coins += amount;
}

function sanitizePlayerForSelf(player) {
  return {
    id: player.id,
    name: player.name,
    coins: player.coins,
    alive: isPlayerAlive(player),
    influences: player.influences.map((inf) => ({ ...inf })),
    exchangePool: player.exchangePool ? player.exchangePool.map((c) => ({ ...c })) : [],
  };
}

function sanitizePlayerForOthers(player) {
  return {
    id: player.id,
    name: player.name,
    coins: player.coins,
    alive: isPlayerAlive(player),
    influences: player.influences.map((inf) => ({
      id: inf.id,
      revealed: inf.revealed,
      role: inf.revealed ? inf.role : null,
    })),
  };
}

function clearPending(room) {
  room.pendingAction = null;
  room.pendingResponses = null;
}

function pendingLoseInfluence(room, playerId, count, reason) {
  room.pendingLoss = { playerId, count, reason };
}

function revealChosenInfluence(room, player, influenceId) {
  const influence = player.influences.find((inf) => inf.id === influenceId && !inf.revealed);
  if (!influence) return { ok: false, message: "Invalid influence." };
  influence.revealed = true;
  addLog(room, `${player.name} loses ${influence.role}.`);
  return { ok: true, role: influence.role };
}

function replaceClaimedRole(room, player, role) {
  const idx = player.influences.findIndex((inf) => !inf.revealed && inf.role === role);
  if (idx === -1) return false;
  const oldRole = player.influences[idx].role;
  room.deck.unshift(oldRole);
  room.deck = shuffle(room.deck);
  const newRole = room.deck.pop();
  player.influences[idx] = createInfluence(newRole);
  return true;
}

function exposeAndReplaceAllCards(room, player) {
  const hidden = player.influences.filter((inf) => !inf.revealed);
  hidden.forEach((inf) => { inf.revealed = true; });
  addLog(room, `${player.name} exposes all hidden cards and changes them.`);
  const replacement = drawInfluences(room.deck, hidden.length);
  player.influences = [
    ...player.influences.filter((inf) => inf.revealed),
    ...replacement,
  ];
}

function maybeFinishGame(room) {
  const alive = livingPlayers(room);
  if (alive.length === 1) {
    room.winnerId = alive[0].id;
    room.phase = "finished";
    clearPending(room);
    room.pendingLoss = null;
    addLog(room, `${alive[0].name} wins the game.`);
    return true;
  }
  return false;
}

function advanceTurn(room) {
  if (maybeFinishGame(room)) return;
  room.currentTurnIndex = nextLivingPlayerIndex(room, room.currentTurnIndex);
  room.phase = "action";
  clearPending(room);
  room.pendingLoss = null;
}

function everyonePassed(room) {
  const responses = room.pendingResponses;
  if (!responses || !room.pendingAction) return false;
  const eligible = livingPlayers(room).filter((p) => p.id !== room.pendingAction.actorId);
  return eligible.every((p) => responses.passed.includes(p.id));
}

function canRespond(room, playerId) {
  if (!room.pendingResponses) return false;
  return !room.pendingResponses.passed.includes(playerId);
}

function requiredClaim(actionType) {
  switch (actionType) {
    case "business": return ROLES.BUSINESS_MAN;
    case "terrorist": return ROLES.TERRORIST;
    case "politician": return ROLES.POLITICIAN;
    case "thief": return ROLES.THIEF;
    case "colonel": return ROLES.COLONEL;
    case "taxman": return ROLES.TAXMAN;
    case "cop": return ROLES.COP;
    default: return null;
  }
}

function allowedBlockers(actionType) {
  if (actionType === "govAid") return [ROLES.TAXMAN];
  if (actionType === "terrorist") return [ROLES.COLONEL];
  if (actionType === "thief") return [ROLES.THIEF];
  return [];
}

function setupPending(room, action) {
  room.pendingAction = action;
  room.pendingResponses = { passed: [] };
  room.phase = "response";
}

function finalizeBusiness(room, actor) {
  const taxClaims = room.pendingAction?.taxClaims || [];
  const taxed = Math.min(3, taxClaims.length);
  const actorGain = 4 - taxed;
  if (actorGain > 0) giveCoins(actor, actorGain);
  taxClaims.forEach((playerId) => {
    const p = getPlayer(room, playerId);
    if (p) giveCoins(p, 1);
  });
  addLog(room, `${actor.name} resolves Business Man and gets ${actorGain} coin(s).`);
  if (taxClaims.length > 0) addLog(room, `Taxman claims collected ${taxClaims.length} coin(s).`);
  advanceTurn(room);
}

function resolveAction(room) {
  const action = room.pendingAction;
  if (!action) return;
  const actor = getPlayer(room, action.actorId);
  const target = action.targetId ? getPlayer(room, action.targetId) : null;

  if (!actor || !isPlayerAlive(actor)) {
    advanceTurn(room);
    return;
  }

  switch (action.type) {
    case "income":
      giveCoins(actor, 1);
      addLog(room, `${actor.name} takes Income.`);
      advanceTurn(room);
      break;

    case "govAid":
      giveCoins(actor, 2);
      addLog(room, `${actor.name} takes Gov. Aid.`);
      advanceTurn(room);
      break;

    case "business":
      room.phase = "businessTaxWindow";
      room.pendingAction.taxClaims = [];
      room.pendingResponses = { passed: [] };
      addLog(room, `${actor.name} starts Business Man for 4 coins. Taxman may tax it.`);
      break;

    case "terrorist":
      pendingLoseInfluence(room, target.id, 1, `Terrorist attack by ${actor.name}`);
      addLog(room, `${actor.name}'s Terrorist action succeeds on ${target.name}.`);
      room.phase = "loseInfluence";
      clearPending(room);
      break;

    case "politician": {
      const hidden = actor.influences.filter((inf) => !inf.revealed).map((x) => ({ ...x }));
      const drawn = drawInfluences(room.deck, 2);
      actor.exchangePool = [...hidden, ...drawn];
      room.phase = "exchange";
      clearPending(room);
      addLog(room, `${actor.name} draws 2 cards for Politician.`);
      break;
    }

    case "thief": {
      const amount = Math.min(2, target.coins);
      removeCoins(target, amount);
      giveCoins(actor, amount);
      addLog(room, `${actor.name} steals ${amount} coin(s) from ${target.name}.`);
      advanceTurn(room);
      break;
    }

    case "colonel": {
      const claimedRole = action.claimedRole;
      const hasRole = target.influences.some((inf) => !inf.revealed && inf.role === claimedRole);
      if (hasRole) {
        addLog(room, `${actor.name}'s accusation is correct. ${target.name} loses a life.`);
        pendingLoseInfluence(room, target.id, 1, `Colonel accusation by ${actor.name}`);
        room.phase = "loseInfluence";
      } else {
        giveCoins(target, 4);
        addLog(room, `${actor.name}'s accusation is false. ${target.name} gets 4 coins and changes all hidden cards.`);
        exposeAndReplaceAllCards(room, target);
        advanceTurn(room);
      }
      clearPending(room);
      break;
    }

    case "taxman": {
      const victims = room.players.filter((p) => p.id !== actor.id && p.coins >= 7 && isPlayerAlive(p));
      let total = 0;
      victims.forEach((p) => {
        removeCoins(p, 1);
        total += 1;
      });
      giveCoins(actor, total);
      addLog(room, `${actor.name} collects ${total} coin(s) with Wealth Tax.`);
      advanceTurn(room);
      break;
    }

    case "cop": {
      const hidden = target.influences.filter((inf) => !inf.revealed);
      if (hidden.length === 0) {
        advanceTurn(room);
        break;
      }
      const picked = hidden[Math.floor(Math.random() * hidden.length)];
      picked.revealed = true;
      addLog(room, `${actor.name} investigates ${target.name} and exposes ${picked.role}.`);
      room.deck.unshift(picked.role);
      room.deck = shuffle(room.deck);
      const newRole = room.deck.pop();
      target.influences = target.influences.filter((inf) => inf.id !== picked.id);
      target.influences.push(createInfluence(newRole));
      addLog(room, `${target.name}'s exposed card is changed.`);
      advanceTurn(room);
      break;
    }

    case "coup":
      pendingLoseInfluence(room, target.id, 1, `Coup by ${actor.name}`);
      addLog(room, `${actor.name} coups ${target.name}.`);
      room.phase = "loseInfluence";
      clearPending(room);
      break;

    default:
      advanceTurn(room);
  }
}

export function createGameManager() {
  const rooms = new Map();

  function createRoom(hostName, socketId) {
    const code = roomCode();
    const room = {
      code,
      phase: "lobby",
      deck: [],
      players: [{
        id: socketId,
        socketId,
        name: hostName || "Host",
        coins: 2,
        influences: [],
        exchangePool: null,
      }],
      currentTurnIndex: 0,
      log: [],
      pendingAction: null,
      pendingResponses: null,
      pendingLoss: null,
      winnerId: null,
    };
    addLog(room, `${room.players[0].name} created room ${code}.`);
    rooms.set(code, room);
    return room;
  }

  function joinRoom(code, name, socketId) {
    const room = rooms.get(code);
    if (!room) return { ok: false, message: "Room not found." };
    if (room.phase !== "lobby") return { ok: false, message: "Game already started." };
    if (room.players.length >= 6) return { ok: false, message: "Room is full." };

    room.players.push({
      id: socketId,
      socketId,
      name: name || `Player ${room.players.length + 1}`,
      coins: 2,
      influences: [],
      exchangePool: null,
    });
    addLog(room, `${name || "Player"} joined room ${code}.`);
    return { ok: true, room };
  }

  function startGame(code, socketId) {
    const room = rooms.get(code);
    if (!room) return { ok: false, message: "Room not found." };
    if (room.players[0].id !== socketId) return { ok: false, message: "Only the host can start." };
    if (room.players.length < 2) return { ok: false, message: "Need at least 2 players." };

    room.deck = createDeck();
    const cardCount = room.players.length <= 4 ? 3 : 2;
    room.players.forEach((player) => {
      player.coins = 2;
      player.influences = drawInfluences(room.deck, cardCount);
      player.exchangePool = null;
    });
    room.currentTurnIndex = 0;
    room.phase = "action";
    room.pendingAction = null;
    room.pendingResponses = null;
    room.pendingLoss = null;
    room.winnerId = null;
    addLog(room, `Game started with ${cardCount} cards per player.`);
    return { ok: true, room };
  }

  function getRoomBySocket(socketId) {
    for (const room of rooms.values()) {
      if (room.players.some((p) => p.socketId === socketId)) return room;
    }
    return null;
  }

  function getStateFor(room, socketId) {
    return {
      code: room.code,
      phase: room.phase,
      currentTurnPlayerId: activePlayer(room)?.id ?? null,
      winnerId: room.winnerId,
      log: room.log,
      pendingAction: room.pendingAction,
      pendingLoss: room.pendingLoss,
      players: room.players.map((p) =>
        p.id === socketId ? sanitizePlayerForSelf(p) : sanitizePlayerForOthers(p)
      ),
    };
  }

  function performAction(socketId, payload) {
    const room = getRoomBySocket(socketId);
    if (!room) return { ok: false, message: "Room not found." };
    if (room.phase !== "action") return { ok: false, message: "Action not allowed right now." };

    const actor = activePlayer(room);
    if (!actor || actor.id !== socketId) return { ok: false, message: "Not your turn." };
    if (!isPlayerAlive(actor)) return { ok: false, message: "You are eliminated." };

    const action = payload.action;
    const targetId = payload.targetId || null;
    const claim = requiredClaim(action);

    if (action === "coup" && actor.coins < 7) return { ok: false, message: "Need 7 coins for Coup." };
    if (action === "terrorist" && actor.coins < 3) return { ok: false, message: "Need 3 coins for Terrorist." };
    if (action === "colonel" && actor.coins < 4) return { ok: false, message: "Need 4 coins for Colonel." };
    if (["terrorist", "thief", "cop", "coup", "colonel"].includes(action) && !targetId) {
      return { ok: false, message: "This action needs a target." };
    }

    const target = targetId ? getPlayer(room, targetId) : null;
    if (targetId && (!target || !isPlayerAlive(target) || target.id === actor.id)) {
      return { ok: false, message: "Invalid target." };
    }

    if (action === "terrorist") removeCoins(actor, 3);
    if (action === "colonel") removeCoins(actor, 4);
    if (action === "coup") removeCoins(actor, 7);

    const pending = {
      type: action,
      actorId: actor.id,
      actorName: actor.name,
      targetId,
      targetName: target?.name || null,
      claim,
      claimedRole: payload.claimedRole || null,
      taxClaims: [],
    };

    if (action === "colonel" && !pending.claimedRole) {
      return { ok: false, message: "Colonel must accuse a specific role." };
    }

    addLog(room, `${actor.name} declares ${action}${claim ? ` as ${claim}` : ""}.`);

    if (action === "income") {
      room.pendingAction = pending;
      resolveAction(room);
      return { ok: true, room };
    }

    if (action === "coup") {
      room.pendingAction = pending;
      room.phase = "coupResponse";
      room.pendingResponses = { passed: [] };
      addLog(room, `${actor.name} starts a Coup. Victim may pay 9 to stop it.`);
      return { ok: true, room };
    }

    setupPending(room, pending);
    return { ok: true, room };
  }

  function passResponse(socketId) {
    const room = getRoomBySocket(socketId);
    if (!room) return { ok: false, message: "Room not found." };
    if (!canRespond(room, socketId)) return { ok: false, message: "Cannot pass now." };

    room.pendingResponses.passed.push(socketId);
    const player = getPlayer(room, socketId);
    addLog(room, `${player.name} passes.`);

    if (room.phase === "coupResponse") {
      const target = getPlayer(room, room.pendingAction.targetId);
      if (everyonePassed(room) || room.pendingResponses.passed.includes(target.id)) {
        resolveAction(room);
      }
      return { ok: true, room };
    }

    if (room.phase === "businessTaxWindow") {
      const eligible = livingPlayers(room).filter((p) => p.id !== room.pendingAction.actorId);
      const allDone = eligible.every((p) =>
        room.pendingResponses.passed.includes(p.id) || room.pendingAction.taxClaims.includes(p.id)
      );
      if (allDone) finalizeBusiness(room, getPlayer(room, room.pendingAction.actorId));
      return { ok: true, room };
    }

    if (everyonePassed(room)) resolveAction(room);
    return { ok: true, room };
  }

  function blockAction(socketId, claimedRole) {
    const room = getRoomBySocket(socketId);
    if (!room) return { ok: false, message: "Room not found." };
    const action = room.pendingAction;
    if (!action || room.phase !== "response") return { ok: false, message: "No action to block." };

    const player = getPlayer(room, socketId);
    if (!player || !isPlayerAlive(player)) return { ok: false, message: "Invalid blocker." };

    const blockers = allowedBlockers(action.type);
    if (!blockers.includes(claimedRole)) return { ok: false, message: "That role cannot block this action." };

    action.block = {
      blockerId: socketId,
      blockerName: player.name,
      claimedRole,
    };
    room.phase = "blockChallengeWindow";
    room.pendingResponses = { passed: [] };
    addLog(room, `${player.name} blocks with ${claimedRole}.`);
    return { ok: true, room };
  }

  function challenge(socketId) {
    const room = getRoomBySocket(socketId);
    if (!room) return { ok: false, message: "Room not found." };
    const action = room.pendingAction;
    if (!action) return { ok: false, message: "Nothing to challenge." };

    const challenger = getPlayer(room, socketId);
    if (!challenger || !isPlayerAlive(challenger)) return { ok: false, message: "Invalid challenger." };

    if (room.phase === "response") {
      const actor = getPlayer(room, action.actorId);
      const proves = replaceClaimedRole(room, actor, action.claim);
      if (proves) {
        addLog(room, `${challenger.name} challenges ${actor.name} and loses.`);
        pendingLoseInfluence(room, challenger.id, 1, `Failed challenge against ${actor.name}`);
        room.phase = "loseInfluenceThenContinue";
      } else {
        addLog(room, `${challenger.name} successfully challenges ${actor.name}.`);
        pendingLoseInfluence(room, actor.id, 1, `Successful challenge by ${challenger.name}`);
        room.phase = "loseInfluenceThenCancel";
      }
      return { ok: true, room };
    }

    if (room.phase === "blockChallengeWindow") {
      const blocker = getPlayer(room, action.block.blockerId);
      const proves = replaceClaimedRole(room, blocker, action.block.claimedRole);
      if (proves) {
        addLog(room, `${challenger.name} fails to challenge the block by ${blocker.name}.`);
        pendingLoseInfluence(room, challenger.id, 1, `Failed challenge against block by ${blocker.name}`);
        room.phase = "loseInfluenceThenBlock";
      } else {
        addLog(room, `${challenger.name} successfully breaks the block by ${blocker.name}.`);
        pendingLoseInfluence(room, blocker.id, 1, `Successful challenge of block by ${challenger.name}`);
        room.phase = "loseInfluenceThenContinue";
      }
      return { ok: true, room };
    }

    return { ok: false, message: "Cannot challenge right now." };
  }

  function payToStopCoup(socketId) {
    const room = getRoomBySocket(socketId);
    if (!room) return { ok: false, message: "Room not found." };
    if (room.phase !== "coupResponse") return { ok: false, message: "No Coup to stop." };
    const action = room.pendingAction;
    if (!action || action.type !== "coup") return { ok: false, message: "No Coup to stop." };
    if (action.targetId !== socketId) return { ok: false, message: "Only the victim can pay 9." };

    const player = getPlayer(room, socketId);
    if (player.coins < 9) return { ok: false, message: "Need 9 coins." };
    removeCoins(player, 9);
    addLog(room, `${player.name} pays 9 coins to stop the Coup.`);
    advanceTurn(room);
    return { ok: true, room };
  }

  function claimBusinessTax(socketId) {
    const room = getRoomBySocket(socketId);
    if (!room) return { ok: false, message: "Room not found." };
    if (room.phase !== "businessTaxWindow") return { ok: false, message: "Not the Taxman window." };
    const player = getPlayer(room, socketId);
    if (!player || !isPlayerAlive(player)) return { ok: false, message: "Invalid player." };
    if (socketId === room.pendingAction.actorId) return { ok: false, message: "Actor cannot tax themselves." };
    if (room.pendingAction.taxClaims.includes(socketId)) return { ok: false, message: "Already claimed." };
    if (room.pendingAction.taxClaims.length >= 3) return { ok: false, message: "Maximum 3 Taxman claims." };

    room.pendingAction.taxClaims.push(socketId);
    addLog(room, `${player.name} claims Taxman on Business.`);

    const eligible = livingPlayers(room).filter((p) => p.id !== room.pendingAction.actorId);
    const allDone = eligible.every((p) =>
      room.pendingResponses.passed.includes(p.id) || room.pendingAction.taxClaims.includes(p.id)
    );
    if (allDone) finalizeBusiness(room, getPlayer(room, room.pendingAction.actorId));

    return { ok: true, room };
  }

  function chooseExchange(socketId, keepIds) {
    const room = getRoomBySocket(socketId);
    if (!room) return { ok: false, message: "Room not found." };
    const player = getPlayer(room, socketId);
    if (!player) return { ok: false, message: "Player not found." };
    if (room.phase !== "exchange") return { ok: false, message: "Not in exchange." };
    if (!player.exchangePool) return { ok: false, message: "No exchange pool." };

    const aliveCount = player.influences.filter((inf) => !inf.revealed).length;
    if (!Array.isArray(keepIds) || keepIds.length !== aliveCount) {
      return { ok: false, message: `Choose exactly ${aliveCount} card(s).` };
    }

    const pool = player.exchangePool;
    const keep = pool.filter((card) => keepIds.includes(card.id));
    if (keep.length !== aliveCount) return { ok: false, message: "Invalid selection." };

    const returned = pool.filter((card) => !keepIds.includes(card.id));
    room.deck.unshift(...returned.map((c) => c.role));
    room.deck = shuffle(room.deck);

    const revealed = player.influences.filter((inf) => inf.revealed);
    player.influences = [...revealed, ...keep.map((k) => ({ ...k }))];
    player.exchangePool = null;
    addLog(room, `${player.name} finishes Politician exchange.`);
    advanceTurn(room);
    return { ok: true, room };
  }

  function chooseLostInfluence(socketId, influenceId) {
    const room = getRoomBySocket(socketId);
    if (!room || !room.pendingLoss) return { ok: false, message: "No influence to lose." };
    if (room.pendingLoss.playerId !== socketId) return { ok: false, message: "Not your loss to choose." };

    const player = getPlayer(room, socketId);
    const result = revealChosenInfluence(room, player, influenceId);
    if (!result.ok) return result;

    room.pendingLoss.count -= 1;
    if (room.pendingLoss.count > 0) return { ok: true, room };

    room.pendingLoss = null;
    if (maybeFinishGame(room)) return { ok: true, room };

    if (room.phase === "loseInfluenceThenContinue") {
      const action = room.pendingAction;
      if (action?.type === "business") {
        room.phase = "businessTaxWindow";
        room.pendingResponses = { passed: [] };
        room.pendingAction.taxClaims = [];
        addLog(room, "Business continues after successful defense.");
        return { ok: true, room };
      }
      resolveAction(room);
      return { ok: true, room };
    }

    if (room.phase === "loseInfluenceThenCancel") {
      addLog(room, "The challenged action is cancelled.");
      advanceTurn(room);
      return { ok: true, room };
    }

    if (room.phase === "loseInfluenceThenBlock") {
      addLog(room, "The block stands. The action is stopped.");
      advanceTurn(room);
      return { ok: true, room };
    }

    if (room.phase === "loseInfluence") {
      advanceTurn(room);
      return { ok: true, room };
    }

    return { ok: true, room };
  }

  function disconnect(socketId) {
    const room = getRoomBySocket(socketId);
    if (!room) return null;
    const idx = room.players.findIndex((p) => p.socketId === socketId);
    if (idx === -1) return null;

    const [player] = room.players.splice(idx, 1);
    addLog(room, `${player.name} disconnected.`);

    if (room.players.length === 0) {
      rooms.delete(room.code);
      return null;
    }

    if (room.currentTurnIndex >= room.players.length) room.currentTurnIndex = 0;
    if (room.phase !== "lobby") maybeFinishGame(room);
    return room;
  }

  return {
    createRoom,
    joinRoom,
    startGame,
    getRoomBySocket,
    getStateFor,
    performAction,
    passResponse,
    blockAction,
    challenge,
    payToStopCoup,
    claimBusinessTax,
    chooseExchange,
    chooseLostInfluence,
    disconnect,
  };
}
