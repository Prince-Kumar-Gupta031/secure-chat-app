import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { BACKEND_URL } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";

const SocketCtx = createContext(null);

export function SocketProvider({ children }) {
    const { user } = useAuth();
    const socketRef = useRef(null);
    const [connected, setConnected] = useState(false);
    const [presence, setPresence] = useState({});
    const [listeners] = useState({
        message: new Set(),
        status: new Set(),
        typing: new Set(),
        read: new Set(),
        chatUpdated: new Set(),
    });

    useEffect(() => {
        const token = localStorage.getItem("drdo_token");
        if (!user || !token) return;
        const sock = io(BACKEND_URL, {
            path: "/api/socket.io",
            auth: { token },
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });
        socketRef.current = sock;
        sock.on("connect", () => setConnected(true));
        sock.on("disconnect", () => setConnected(false));
        sock.on("presence", (p) => {
            setPresence((prev) => ({ ...prev, [p.user_id]: { online: p.online, last_seen: p.last_seen } }));
        });
        sock.on("new_message", (msg) => { listeners.message.forEach((fn) => fn(msg)); });
        sock.on("message_status", (s) => { listeners.status.forEach((fn) => fn(s)); });
        sock.on("typing", (t) => { listeners.typing.forEach((fn) => fn(t)); });
        sock.on("messages_read", (r) => { listeners.read.forEach((fn) => fn(r)); });
        sock.on("chat_updated", (c) => { listeners.chatUpdated.forEach((fn) => fn(c)); });
        return () => { sock.disconnect(); socketRef.current = null; };
    }, [user, listeners]);

    const on = useCallback((event, fn) => {
        listeners[event].add(fn);
        return () => listeners[event].delete(fn);
    }, [listeners]);

    const sendMessage = useCallback((payload) => {
        return new Promise((resolve) => {
            socketRef.current?.emit("send_message", payload, (ack) => resolve(ack));
        });
    }, []);

    const sendTyping = useCallback((opts) => {
        // opts: { peer_id?, chat_id?, typing }
        socketRef.current?.emit("typing", opts);
    }, []);

    const markDelivered = useCallback((id) => {
        socketRef.current?.emit("mark_delivered", { id });
    }, []);

    return (
        <SocketCtx.Provider value={{ socket: socketRef.current, connected, presence, on, sendMessage, sendTyping, markDelivered }}>
            {children}
        </SocketCtx.Provider>
    );
}

export const useSocket = () => useContext(SocketCtx);
