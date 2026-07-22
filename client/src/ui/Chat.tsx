import { useEffect, useRef, useState } from "react";
import { getSocket } from "../net/socket";
import { ChatMessage } from "../net/protocol";

/** Painel de chat de texto em tempo real (global). */
export function Chat({ selfId }: { selfId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socket = getSocket();
    const onMsg = (msg: ChatMessage) =>
      setMessages((prev) => [...prev.slice(-99), msg]);
    socket.on("chat-message", onMsg);
    return () => {
      socket.off("chat-message", onMsg);
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    getSocket().emit("chat", { text: clean });
    setText("");
  }

  return (
    <div className="chat">
      <div className="chat-header" onClick={() => setOpen((o) => !o)}>
        <span>💬 Chat</span>
        <span>{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <>
          <div className="chat-messages" ref={listRef}>
            {messages.map((m, i) => (
              <div className="chat-msg" key={i}>
                <span
                  className="who"
                  style={{ color: m.from === selfId ? "#4c8bf5" : "#e8eaf0" }}
                >
                  {m.from === selfId ? "Você" : m.name}:
                </span>{" "}
                <span>{m.text}</span>
              </div>
            ))}
          </div>
          <form className="chat-form" onSubmit={send}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escreva uma mensagem…"
              maxLength={500}
            />
            <button type="submit">Enviar</button>
          </form>
        </>
      )}
    </div>
  );
}
