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
        if (!res?.ok) setError(res?.message || "Unknown error");
        else setError("");
        resolve(res);
      });
    });
  }

  return { room, error, connected, emit };
}

function PlayerCard({ player, isCurrentTurn, isSelf, onTarget, allowTarget }) {
  return (
    <div className={`playerBox ${isCurrentTurn ? "active" : ""} ${!player.alive ? "dead" : ""}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>{player.name}</strong>
        <span>🪙 {player.coins}</span>
      </div>
      <div className="small muted">{player.alive ? "Alive" : "Eliminated"}</div>
      <div className="influences">
        {player.influences.map((inf) => (
          <div
            key={inf.id}
            className={`influence ${inf.revealed ? "revealed" : isSelf ? "" : "back"}`}
            onClick={() => allowTarget && onTarget?.(player.id)}
            style={{ cursor: allowTarget ? "pointer" : "default" }}
          >
            {inf.revealed ? inf.role : isSelf ? inf.role : "Hidden"}
          </div>
        ))}
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
    if (action === "colonel") payload.claimedRole = colonelRole;
    await emit("action:play", payload);
  }

  async function pass() { await emit("action:pass"); }
  async function challenge() { await emit("action:challenge"); }
  async function block(role) { await emit("action:block", { claimedRole: role }); }
  async function stopCoup() { await emit("action:stop-coup"); }
  async function businessTax() { await emit("action:business-tax"); }
  async function loseCard(influenceId) { await emit("action:lose-card", { influenceId }); }
  async function submitExchange() { await emit("action:exchange-choose", { keepIds: exchangeSelection }); }

  function toggleExchange(id, max) {
    setExchangeSelection((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= max) return prev;
      return [...prev, id];
    });
  }

  if (!room) {
    return (
      <div className="app">
        <div className="card" style={{ maxWidth: 520, margin: "64px auto" }}>
          <div className="title">Advanced Coup</div>
          <p className="muted">Multiplayer bluffing game. Create or join a room.</p>
          <div className="grid">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            <div className="row">
              <button onClick={createRoom}>Create room</button>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Room code" />
              <button onClick={joinRoom}>Join room</button>
            </div>
            <div className="small muted">Socket: {connected ? "connected" : "disconnected"}</div>
            {error && <div className="error">{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  const isHost = room.players[0]?.id === socket.id;
  const exchangePool = me?.exchangePool || [];
  const hiddenCount = me?.influences?.filter((i) => !i.revealed).length || 0;

  return (
    <div className="app">
      <div className="topbar">
        <div>
          <div className="title">Advanced Coup</div>
          <div className="muted">Room: {room.code}</div>
        </div>
        <div className="muted">{connected ? "Online" : "Offline"}</div>
      </div>

      {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}
      {room.winnerId && (
        <div className="notice" style={{ marginBottom: 16 }}>
          {room.players.find((p) => p.id === room.winnerId)?.name} wins.
        </div>
      )}

      <div className="grid mainGrid" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div className="grid">
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <strong>Players</strong>
              <span className="muted">Turn: {room.players.find((p) => p.id === currentTurnPlayerId)?.name || "-"}</span>
            </div>
            <div className="players">
              {room.players.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  isCurrentTurn={player.id === currentTurnPlayerId}
                  isSelf={player.id === socket.id}
                  allowTarget={myTurn && player.id !== socket.id && player.alive}
                  onTarget={setSelectedTarget}
                />
              ))}
            </div>
          </div>

          <div className="card">
            <strong>Action panel</strong>
            <div className="small muted" style={{ marginTop: 6, marginBottom: 12 }}>
              Selected target: {room.players.find((p) => p.id === selectedTarget)?.name || "none"}
            </div>

            {room.phase === "lobby" && (
              <div className="row">
                <div className="muted">Waiting in lobby.</div>
                {isHost && <button onClick={startGame}>Start game</button>}
              </div>
            )}

            {myTurn && room.phase === "action" && (
              <>
                <div className="actions">
                  <button onClick={() => playAction("income")}>Income</button>
                  <button onClick={() => playAction("govAid")}>Gov. Aid</button>
                  <button onClick={() => playAction("business")}>Business Man</button>
                  <button onClick={() => playAction("terrorist")}>Terrorist (3)</button>
                  <button onClick={() => playAction("politician")}>Politician</button>
                  <button onClick={() => playAction("thief")}>Thief</button>
                  <button onClick={() => playAction("taxman")}>Taxman</button>
                  <button onClick={() => playAction("cop")}>Cop</button>
                  <button className="warn" onClick={() => playAction("coup")}>Coup (7)</button>
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <select value={colonelRole} onChange={(e) => setColonelRole(e.target.value)}>
                    {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                  <button className="secondary" onClick={() => playAction("colonel")}>Colonel Accuse (4)</button>
                </div>
                {targetable.length > 0 && (
                  <div className="small muted" style={{ marginTop: 8 }}>
                    Clique sur les cartes d’un joueur pour le cibler.
                  </div>
                )}
              </>
            )}

            {room.phase === "response" && pendingAction && me?.alive && me.id !== pendingAction.actorId && (
              <div className="stack">
                <div className="notice">
                  {pendingAction.actorName} declared {pendingAction.type}{pendingAction.claim ? ` as ${pendingAction.claim}` : ""}.
                </div>
                <div className="row">
                  <button onClick={challenge}>Challenge</button>
                  {pendingAction.type === "govAid" && <button onClick={() => block("Taxman")}>Block as Taxman</button>}
                  {pendingAction.type === "terrorist" && <button onClick={() => block("Colonel")}>Block as Colonel</button>}
                  {pendingAction.type === "thief" && <button onClick={() => block("Thief")}>Block as Thief</button>}
                  <button className="secondary" onClick={pass}>Pass</button>
                </div>
              </div>
            )}

            {room.phase === "blockChallengeWindow" && pendingAction && me?.alive && (
              <div className="stack">
                <div className="notice">
                  {pendingAction.block?.blockerName} blocks with {pendingAction.block?.claimedRole}.
                </div>
                <div className="row">
                  <button onClick={challenge}>Challenge block</button>
                  <button className="secondary" onClick={pass}>Pass</button>
                </div>
              </div>
            )}

            {room.phase === "coupResponse" && pendingAction && pendingAction.targetId === socket.id && (
              <div className="stack">
                <div className="notice">You are being couped. You may pay 9 coins to stop it.</div>
                <div className="row">
                  <button onClick={stopCoup}>Pay 9 to stop</button>
                  <button className="secondary" onClick={pass}>Do not stop</button>
                </div>
              </div>
            )}

            {room.phase === "businessTaxWindow" && pendingAction && me?.id !== pendingAction.actorId && me?.alive && (
              <div className="stack">
                <div className="notice">
                  {pendingAction.actorName} is taking 4 with Business Man. Up to 3 Taxman claims can take 1 each.
                </div>
                <div className="row">
                  <button onClick={businessTax}>Claim Taxman</button>
                  <button className="secondary" onClick={pass}>Pass</button>
                </div>
              </div>
            )}

            {room.phase === "exchange" && exchangePool.length > 0 && (
              <div className="stack">
                <div className="notice">Choose exactly {hiddenCount} card(s) to keep.</div>
                <div className="influences">
                  {exchangePool.map((card) => (
                    <div
                      key={card.id}
                      className="influence"
                      style={{
                        outline: exchangeSelection.includes(card.id) ? "3px solid #22c55e" : "none",
                        cursor: "pointer",
                      }}
                      onClick={() => toggleExchange(card.id, hiddenCount)}
                    >
                      {card.role}
                    </div>
                  ))}
                </div>
                <button onClick={submitExchange}>Confirm exchange</button>
              </div>
            )}

            {pendingLoss?.playerId === socket.id && me && (
              <div className="stack">
                <div className="notice">Choose a card to lose.</div>
                <div className="influences">
                  {me.influences.filter((i) => !i.revealed).map((inf) => (
                    <div
                      key={inf.id}
                      className="influence"
                      style={{ cursor: "pointer" }}
                      onClick={() => loseCard(inf.id)}
                    >
                      {inf.role}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <strong>Action log</strong>
          <div className="log" style={{ marginTop: 12 }}>
            {room.log.map((item) => (
              <div key={item.id} className="logItem">{item.text}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
