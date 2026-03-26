import { useEffect, useMemo, useState } from "react";
import { socket } from "./socket.js";

const ROLE_OPTIONS = [
  "Business Man",
  "Terrorist",
  "Politician",
  "Thief",
  "Colonel",
  "Taxman",
  "Cop",
];

function useSocketRoom() {
  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onUpdate = (data) => setRoom(data);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:update", onUpdate);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:update", onUpdate);
    };
  }, []);

  function emit(event, payload = {}) {
    return new Promise((resolve) => {
      socket.emit(event, payload, (res) => {
        if (!res?.ok) {
          setError(res?.message || "Unknown error");
        } else {
          setError("");
        }
        resolve(res);
      });
    });
  }

  return { room, error, connected, emit };
}

function InfluenceCard({ influence, isSelf, selectable, selected, onClick }) {
  const hidden = !influence.revealed && !isSelf;

  return (
    <button
      type="button"
      className={`influenceCard ${hidden ? "hiddenCard" : ""} ${
        influence.revealed ? "revealedCard" : ""
      } ${selected ? "selectedCard" : ""}`}
      onClick={onClick}
      disabled={!selectable}
    >
      <div className="influenceLabel">
        {hidden ? "Hidden" : influence.role}
      </div>
      <div className="influenceState">
        {influence.revealed ? "Revealed" : "Alive"}
      </div>
    </button>
  );
}

function PlayerPanel({
  player,
  isCurrentTurn,
  isSelf,
  selectedTarget,
  canTarget,
  onSelectTarget,
}) {
  return (
    <div
      className={`playerPanel ${isCurrentTurn ? "playerTurn" : ""} ${
        !player.alive ? "playerDead" : ""
      } ${selectedTarget ? "playerTargeted" : ""}`}
    >
      <div className="playerHeader">
        <div>
          <div className="playerNameRow">
            <div className="playerAvatar">{player.name?.[0]?.toUpperCase() || "P"}</div>
            <div>
              <div className="playerName">
                {player.name} {isSelf ? "(You)" : ""}
              </div>
              <div className="playerStatus">
                {player.alive ? "In game" : "Eliminated"}
              </div>
            </div>
          </div>
        </div>

        <div className="coinBadge">🪙 {player.coins}</div>
      </div>

      <div className="influencesGrid">
        {player.influences.map((inf) => (
          <InfluenceCard
            key={inf.id}
            influence={inf}
            isSelf={isSelf}
            selectable={canTarget}
            selected={selectedTarget}
            onClick={() => {
              if (canTarget) onSelectTarget(player.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function LandingScreen({ connected, error, name, setName, code, setCode, onCreate, onJoin }) {
  return (
    <div className="landingWrap">
      <div className="landingGlow landingGlowOne" />
      <div className="landingGlow landingGlowTwo" />

      <div className="landingCard">
        <div className="eyebrow">Online bluffing card game</div>
        <h1 className="landingTitle">Advanced Coup</h1>
        <p className="landingText">
          Create a private room, invite your friends, bluff hard, and survive.
        </p>

        <div className="connectionRow">
          <span className={`statusDot ${connected ? "connected" : "disconnected"}`} />
          <span>{connected ? "Socket connected" : "Socket disconnected"}</span>
        </div>

        <div className="formBlock">
          <label className="fieldLabel">Your name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
          />
        </div>

        <div className="joinRow">
          <div className="joinCol">
            <label className="fieldLabel">Room code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD"
            />
          </div>
        </div>

        <div className="landingActions">
          <button className="primaryBtn" onClick={onCreate}>
            Create room
          </button>
          <button className="secondaryBtn" onClick={onJoin}>
            Join room
          </button>
        </div>

        {error && <div className="errorBox">{error}</div>}
      </div>
    </div>
  );
}

export default function App() {
  const { room, error, connected, emit } = useSocketRoom();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [selectedTarget, setSelectedTarget] = useState("");
  const [colonelRole, setColonelRole] = useState(ROLE_OPTIONS[0]);
  const [exchangeSelection, setExchangeSelection] = useState([]);

  const me = room?.players?.find((p) => p.id === socket.id) || null;
  const currentTurnPlayerId = room?.currentTurnPlayerId;
  const myTurn = currentTurnPlayerId === socket.id;
  const pendingAction = room?.pendingAction;
  const pendingLoss = room?.pendingLoss;

  const targetable = useMemo(() => {
    if (!room || !me) return [];
    return room.players.filter((p) => p.id !== me.id && p.alive);
  }, [room, me]);

  useEffect(() => {
    setExchangeSelection([]);
  }, [room?.phase]);

  async function createRoom() {
    await emit("room:create", { name: name || "Player" });
  }

  async function joinRoom() {
    await emit("room:join", { code, name: name || "Player" });
  }

  async function startGame() {
    await emit("game:start", { code: room.code });
  }

  async function playAction(action) {
    const payload = { action };

    if (["terrorist", "thief", "cop", "coup", "colonel"].includes(action)) {
      payload.targetId = selectedTarget;
    }

    if (action === "colonel") {
      payload.claimedRole = colonelRole;
    }

    await emit("action:play", payload);
  }

  async function pass() {
    await emit("action:pass");
  }

  async function challenge() {
    await emit("action:challenge");
  }

  async function block(role) {
    await emit("action:block", { claimedRole: role });
  }

  async function stopCoup() {
    await emit("action:stop-coup");
  }

  async function businessTax() {
    await emit("action:business-tax");
  }

  async function loseCard(influenceId) {
    await emit("action:lose-card", { influenceId });
  }

  async function submitExchange() {
    await emit("action:exchange-choose", { keepIds: exchangeSelection });
  }

  async function copyRoomCode() {
    if (!room?.code) return;
    try {
      await navigator.clipboard.writeText(room.code);
    } catch {
      // ignore clipboard failure
    }
  }

  function toggleExchange(id, max) {
    setExchangeSelection((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= max) return prev;
      return [...prev, id];
    });
  }

  if (!room) {
    return (
      <LandingScreen
        connected={connected}
        error={error}
        name={name}
        setName={setName}
        code={code}
        setCode={setCode}
        onCreate={createRoom}
        onJoin={joinRoom}
      />
    );
  }

  const isHost = room.players[0]?.id === socket.id;
  const exchangePool = me?.exchangePool || [];
  const hiddenCount = me?.influences?.filter((i) => !i.revealed).length || 0;
  const currentTurnName = room.players.find((p) => p.id === currentTurnPlayerId)?.name || "-";

  return (
    <div className="gamePage">
      <div className="pageGlow pageGlowOne" />
      <div className="pageGlow pageGlowTwo" />

      <div className="gameShell">
        <div className="topBar">
          <div>
            <div className="eyebrow">Advanced Coup</div>
            <div className="roomTitleRow">
              <h1 className="roomTitle">Room {room.code}</h1>
              <button className="ghostBtn smallBtn" onClick={copyRoomCode}>
                Copy code
              </button>
            </div>
          </div>

          <div className="topBarRight">
            <div className="connectionRow compact">
              <span className={`statusDot ${connected ? "connected" : "disconnected"}`} />
              <span>{connected ? "Connected" : "Disconnected"}</span>
            </div>
            <div className="turnBadge">Turn: {currentTurnName}</div>
          </div>
        </div>

        {error && <div className="errorBox">{error}</div>}

        {room.winnerId && (
          <div className="winnerBanner">
            {room.players.find((p) => p.id === room.winnerId)?.name} wins the game.
          </div>
        )}

        <div className="mainLayout">
          <div className="leftColumn">
            <div className="panel">
              <div className="sectionHeader">
                <div>
                  <div className="sectionTitle">Players</div>
                  <div className="sectionSubtext">
                    Click a player to target them when needed.
                  </div>
                </div>
              </div>

              <div className="playersLayout">
                {room.players.map((player) => (
                  <PlayerPanel
                    key={player.id}
                    player={player}
                    isCurrentTurn={player.id === currentTurnPlayerId}
                    isSelf={player.id === socket.id}
                    selectedTarget={selectedTarget === player.id}
                    canTarget={myTurn && player.id !== socket.id && player.alive}
                    onSelectTarget={setSelectedTarget}
                  />
                ))}
              </div>
            </div>

            <div className="centerBoard">
              <div className="boardCard">
                <div className="sectionTitle">Action Stack</div>
                <div className="stackBox">
                  {pendingAction ? (
                    <>
                      <div className="stackItem">
                        <span className="stackLabel">Actor</span>
                        <span>{pendingAction.actorName}</span>
                      </div>
                      <div className="stackItem">
                        <span className="stackLabel">Action</span>
                        <span>{pendingAction.type}</span>
                      </div>
                      {pendingAction.claim && (
                        <div className="stackItem">
                          <span className="stackLabel">Claim</span>
                          <span>{pendingAction.claim}</span>
                        </div>
                      )}
                      {pendingAction.targetName && (
                        <div className="stackItem">
                          <span className="stackLabel">Target</span>
                          <span>{pendingAction.targetName}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="emptyState">No pending action.</div>
                  )}
                </div>
              </div>

              <div className="boardCard">
                <div className="sectionTitle">Game State</div>
                <div className="phaseBadge">{room.phase}</div>
                <div className="boardSubtext">
                  {myTurn ? "It is your turn." : "Wait for your turn or react to actions."}
                </div>
                {selectedTarget && (
                  <div className="targetBadge">
                    Target selected:{" "}
                    {room.players.find((p) => p.id === selectedTarget)?.name || "Unknown"}
                  </div>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="sectionHeader">
                <div>
                  <div className="sectionTitle">Your Hand</div>
                  <div className="sectionSubtext">
                    Your cards and available reactions appear here.
                  </div>
                </div>
                <div className="coinBadge bigCoin">🪙 {me?.coins ?? 0}</div>
              </div>

              <div className="myCardsRow">
                {me?.influences?.map((inf) => (
                  <InfluenceCard
                    key={inf.id}
                    influence={inf}
                    isSelf
                    selectable={false}
                    selected={false}
                    onClick={() => {}}
                  />
                ))}
              </div>

              {room.phase === "lobby" && (
                <div className="actionPanel">
                  <div className="infoNotice">Waiting in lobby for players to join.</div>
                  {isHost && (
                    <button className="primaryBtn" onClick={startGame}>
                      Start game
                    </button>
                  )}
                </div>
              )}

              {myTurn && room.phase === "action" && (
                <div className="actionPanel">
                  <div className="sectionSubtext">
                    Pick an action. Some actions require selecting a target first.
                  </div>

                  <div className="actionsGrid">
                    <button className="primaryBtn" onClick={() => playAction("income")}>
                      Income
                    </button>
                    <button className="primaryBtn" onClick={() => playAction("govAid")}>
                      Gov. Aid
                    </button>
                    <button className="primaryBtn" onClick={() => playAction("business")}>
                      Business Man
                    </button>
                    <button className="primaryBtn" onClick={() => playAction("terrorist")}>
                      Terrorist (3)
                    </button>
                    <button className="primaryBtn" onClick={() => playAction("politician")}>
                      Politician
                    </button>
                    <button className="primaryBtn" onClick={() => playAction("thief")}>
                      Thief
                    </button>
                    <button className="primaryBtn" onClick={() => playAction("taxman")}>
                      Taxman
                    </button>
                    <button className="primaryBtn" onClick={() => playAction("cop")}>
                      Cop
                    </button>
                    <button className="dangerBtn" onClick={() => playAction("coup")}>
                      Coup (7)
                    </button>
                  </div>

                  <div className="colonelRow">
                    <select value={colonelRole} onChange={(e) => setColonelRole(e.target.value)}>
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <button className="secondaryBtn" onClick={() => playAction("colonel")}>
                      Colonel Accuse (4)
                    </button>
                  </div>
                </div>
              )}

              {room.phase === "response" && pendingAction && me?.alive && me.id !== pendingAction.actorId && (
                <div className="reactionPanel">
                  <div className="infoNotice">
                    {pendingAction.actorName} declared {pendingAction.type}
                    {pendingAction.claim ? ` as ${pendingAction.claim}` : ""}.
                  </div>

                  <div className="actionsRow">
                    <button className="secondaryBtn" onClick={challenge}>
                      Challenge
                    </button>
                    {pendingAction.type === "govAid" && (
                      <button className="ghostBtn" onClick={() => block("Taxman")}>
                        Block as Taxman
                      </button>
                    )}
                    {pendingAction.type === "terrorist" && (
                      <button className="ghostBtn" onClick={() => block("Colonel")}>
                        Block as Colonel
                      </button>
                    )}
                    {pendingAction.type === "thief" && (
                      <button className="ghostBtn" onClick={() => block("Thief")}>
                        Block as Thief
                      </button>
                    )}
                    <button className="softBtn" onClick={pass}>
                      Pass
                    </button>
                  </div>
                </div>
              )}

              {room.phase === "blockChallengeWindow" && pendingAction && me?.alive && (
                <div className="reactionPanel">
                  <div className="infoNotice">
                    {pendingAction.block?.blockerName} blocks with {pendingAction.block?.claimedRole}.
                  </div>
                  <div className="actionsRow">
                    <button className="secondaryBtn" onClick={challenge}>
                      Challenge block
                    </button>
                    <button className="softBtn" onClick={pass}>
                      Pass
                    </button>
                  </div>
                </div>
              )}

              {room.phase === "coupResponse" && pendingAction && pendingAction.targetId === socket.id && (
                <div className="reactionPanel">
                  <div className="warningNotice">
                    You are being couped. You may pay 9 coins to stop it.
                  </div>
                  <div className="actionsRow">
                    <button className="dangerBtn" onClick={stopCoup}>
                      Pay 9 to stop
                    </button>
                    <button className="softBtn" onClick={pass}>
                      Do not stop
                    </button>
                  </div>
                </div>
              )}

              {room.phase === "businessTaxWindow" && pendingAction && me?.id !== pendingAction.actorId && me?.alive && (
                <div className="reactionPanel">
                  <div className="infoNotice">
                    {pendingAction.actorName} is taking 4 with Business Man. Up to 3 Taxman claims can take 1 each.
                  </div>
                  <div className="actionsRow">
                    <button className="secondaryBtn" onClick={businessTax}>
                      Claim Taxman
                    </button>
                    <button className="softBtn" onClick={pass}>
                      Pass
                    </button>
                  </div>
                </div>
              )}

              {room.phase === "exchange" && exchangePool.length > 0 && (
                <div className="reactionPanel">
                  <div className="infoNotice">
                    Choose exactly {hiddenCount} card(s) to keep.
                  </div>
                  <div className="myCardsRow">
                    {exchangePool.map((card) => (
                      <button
                        key={card.id}
                        className={`influenceCard ${exchangeSelection.includes(card.id) ? "selectedCard" : ""}`}
                        onClick={() => toggleExchange(card.id, hiddenCount)}
                      >
                        <div className="influenceLabel">{card.role}</div>
                        <div className="influenceState">Candidate</div>
                      </button>
                    ))}
                  </div>
                  <button className="primaryBtn" onClick={submitExchange}>
                    Confirm exchange
                  </button>
                </div>
              )}

              {pendingLoss?.playerId === socket.id && me && (
                <div className="reactionPanel">
                  <div className="warningNotice">Choose a card to lose.</div>
                  <div className="myCardsRow">
                    {me.influences
                      .filter((i) => !i.revealed)
                      .map((inf) => (
                        <button
                          key={inf.id}
                          className="influenceCard"
                          onClick={() => loseCard(inf.id)}
                        >
                          <div className="influenceLabel">{inf.role}</div>
                          <div className="influenceState">Click to lose</div>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rightColumn">
            <div className="panel logPanel">
              <div className="sectionHeader">
                <div>
                  <div className="sectionTitle">Action Log</div>
                  <div className="sectionSubtext">Latest events in the room.</div>
                </div>
              </div>

              <div className="logList">
                {room.log.map((item) => (
                  <div key={item.id} className="logItem">
                    {item.text}
                  </div>
                ))}
              </div>
            </div>

            <div className="panel rulesPanel">
              <div className="sectionTitle">Quick Reminder</div>
              <div className="rulesList">
                <div>• Coup costs 7 and can be stopped by the victim for 9.</div>
                <div>• Terrorist costs 3 and removes 1 chosen influence.</div>
                <div>• Business gives 4, but Taxman can reduce it.</div>
                <div>• Colonel accuse costs 4 and names a specific role.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}