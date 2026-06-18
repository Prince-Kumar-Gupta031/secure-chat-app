import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { BACKEND_URL } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { useSocket } from "@/contexts/SocketContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Paperclip, Search, Circle, Loader2, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import MessageBubble from "@/components/chat/MessageBubble";

dayjs.extend(relativeTime);

export default function ChatPage() {
    const { user } = useAuth();
    const { chatId } = useParams();
    const nav = useNavigate();
    const { connected, presence, on, sendMessage, sendTyping, markDelivered } = useSocket();

    const [chats, setChats] = useState([]);
    const [activeChat, setActiveChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");
    const [search, setSearch] = useState("");
    const [peerTyping, setPeerTyping] = useState(false);
    const [uploading, setUploading] = useState(false);
    const messagesEndRef = useRef(null);
    const fileRef = useRef(null);
    const typingTimer = useRef(null);

    const loadChats = useCallback(async () => {
        const { data } = await api.get("/chats");
        setChats(data);
    }, []);

    useEffect(() => { loadChats(); }, [loadChats]);

    // Load active chat & messages
    useEffect(() => {
        if (!chatId) { setActiveChat(null); setMessages([]); return; }
        const found = chats.find((c) => c.id === chatId);
        if (found) setActiveChat(found);
        api.get(`/chats/${chatId}/messages`).then(({ data }) => {
            setMessages(data);
            api.post(`/chats/${chatId}/read`).catch(() => {});
            data.forEach((m) => { if (m.receiver_id === user.id && m.status === "sent") markDelivered(m.id); });
        }).catch(() => {});
    }, [chatId, chats, user.id, markDelivered]);

    // Socket listeners
    useEffect(() => {
        const offMsg = on("message", (msg) => {
            if (activeChat && msg.chat_id === activeChat.id) {
                setMessages((prev) => [...prev, msg]);
                if (msg.receiver_id === user.id) {
                    api.post(`/chats/${activeChat.id}/read`).catch(() => {});
                }
            }
            loadChats();
        });
        const offStatus = on("status", (s) => {
            setMessages((prev) => prev.map((m) => m.id === s.id ? { ...m, status: s.status } : m));
        });
        const offRead = on("read", (r) => {
            if (activeChat && r.chat_id === activeChat.id) {
                setMessages((prev) => prev.map((m) => m.sender_id === user.id ? { ...m, status: "read" } : m));
            }
        });
        const offTyping = on("typing", (t) => {
            if (activeChat && activeChat.peer?.id === t.user_id) setPeerTyping(t.typing);
        });
        return () => { offMsg(); offStatus(); offRead(); offTyping(); };
    }, [on, activeChat, user.id, loadChats]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, peerTyping]);

    const send = async () => {
        if (!activeChat || !text.trim()) return;
        const trimmed = text.trim();
        setText("");
        sendTyping(activeChat.peer.id, false);
        const ack = await sendMessage({ peer_id: activeChat.peer.id, text: trimmed });
        if (ack?.error) toast.error(ack.error);
    };

    const onAttach = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file || !activeChat) return;
        if (file.size > 100 * 1024 * 1024) { toast.error("File exceeds 100 MB"); return; }
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
            const ack = await sendMessage({ peer_id: activeChat.peer.id, attachment: data });
            if (ack?.error) toast.error(ack.error);
        } catch (err) {
            toast.error(err.response?.data?.detail || "Upload failed");
        } finally { setUploading(false); }
    };

    const onTextChange = (v) => {
        setText(v);
        if (!activeChat) return;
        sendTyping(activeChat.peer.id, true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => sendTyping(activeChat.peer.id, false), 1500);
    };

    const filtered = chats.filter((c) => {
        if (!search) return true;
        const s = search.toLowerCase();
        return c.peer?.full_name?.toLowerCase().includes(s) || c.peer?.employee_id?.toLowerCase().includes(s);
    });

    const peerOnline = activeChat && (presence[activeChat.peer?.id]?.online ?? activeChat.peer?.online);
    const peerLastSeen = activeChat && (presence[activeChat.peer?.id]?.last_seen ?? activeChat.peer?.last_seen);

    return (
        <div className="flex flex-1 min-h-0">
            {/* Sidebar */}
            <div className="w-80 border-r border-border bg-card flex flex-col">
                <div className="p-4 border-b border-border">
                    <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-2">CONVERSATIONS</div>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input data-testid="chat-search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats…" className="pl-8 h-9 text-sm" />
                    </div>
                </div>
                <ScrollArea className="flex-1">
                    {filtered.length === 0 && (
                        <div className="p-6 text-center text-sm text-muted-foreground">
                            No conversations yet. Open the <button onClick={() => nav("/directory")} className="text-accent hover:underline">Directory</button> to start one.
                        </div>
                    )}
                    {filtered.map((c) => {
                        const isActive = c.id === chatId;
                        const online = presence[c.peer?.id]?.online ?? c.peer?.online;
                        return (
                            <button
                                key={c.id}
                                data-testid={`chat-item-${c.id}`}
                                onClick={() => nav(`/chat/${c.id}`)}
                                className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-border/50 transition-colors ${isActive ? "bg-accent/10" : "hover:bg-muted"}`}
                            >
                                <div className="relative">
                                    <Avatar className="h-10 w-10 border border-border">
                                        {c.peer?.profile_picture && <AvatarImage src={`${BACKEND_URL}${c.peer.profile_picture}`} />}
                                        <AvatarFallback className="text-xs font-mono bg-muted">{c.peer?.full_name?.split(" ").map(s => s[0]).slice(0,2).join("") || "?"}</AvatarFallback>
                                    </Avatar>
                                    {online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success border-2 border-card" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="font-semibold text-sm truncate">{c.peer?.full_name}</div>
                                        {c.last_message_at && <div className="font-mono text-[10px] text-muted-foreground shrink-0">{dayjs(c.last_message_at).format("HH:mm")}</div>}
                                    </div>
                                    <div className="flex items-center justify-between gap-2 mt-0.5">
                                        <div className="text-xs text-muted-foreground truncate">{c.last_message_preview || "—"}</div>
                                        {c.unread > 0 && <div className="bg-accent text-accent-foreground text-[10px] font-mono font-bold rounded-full px-1.5 min-w-[18px] h-[18px] flex items-center justify-center">{c.unread}</div>}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </ScrollArea>
            </div>

            {/* Chat window */}
            <div className="flex-1 flex flex-col min-w-0 bg-background">
                {!activeChat ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                        <div className="h-16 w-16 rounded-md bg-accent/10 border border-accent/30 flex items-center justify-center mb-4">
                            <MessageSquare className="h-7 w-7 text-accent" strokeWidth={1.5} />
                        </div>
                        <h3 className="font-heading font-bold text-xl mb-1">Select a conversation</h3>
                        <p className="text-sm text-muted-foreground max-w-sm">Pick a chat on the left, or open the <button className="text-accent hover:underline" onClick={() => nav("/directory")}>Employee Directory</button> to find someone.</p>
                        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mt-6 flex items-center gap-2">
                            <Circle className={`h-2 w-2 ${connected ? "fill-success text-success" : "fill-destructive text-destructive"}`} />
                            {connected ? "SOCKET CONNECTED" : "SOCKET DISCONNECTED"}
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="px-5 py-3 border-b border-border bg-card flex items-center gap-3">
                            <Avatar className="h-9 w-9 border border-border">
                                {activeChat.peer?.profile_picture && <AvatarImage src={`${BACKEND_URL}${activeChat.peer.profile_picture}`} />}
                                <AvatarFallback className="text-xs font-mono bg-muted">{activeChat.peer?.full_name?.split(" ").map(s => s[0]).slice(0,2).join("")}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm flex items-center gap-2">
                                    {activeChat.peer?.full_name}
                                    <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">{activeChat.peer?.employee_id}</span>
                                </div>
                                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                                    {peerTyping ? (
                                        <span className="text-accent">typing…</span>
                                    ) : peerOnline ? (
                                        <><Circle className="h-1.5 w-1.5 fill-success text-success" /> Online</>
                                    ) : peerLastSeen ? (
                                        <>Last seen {dayjs(peerLastSeen).fromNow()}</>
                                    ) : (
                                        <>Offline</>
                                    )}
                                </div>
                            </div>
                            <Button data-testid="close-chat-btn" variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav("/chat")}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <ScrollArea className="flex-1 px-5 py-4">
                            <div className="space-y-2 max-w-3xl mx-auto">
                                {messages.map((m) => <MessageBubble key={m.id} message={m} isOwn={m.sender_id === user.id} />)}
                                {peerTyping && (
                                    <div className="flex justify-start">
                                        <div className="px-3 py-2 rounded-md bg-bubble-received border border-border text-xs text-muted-foreground font-mono">typing…</div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        </ScrollArea>

                        <div className="border-t border-border bg-card p-3 flex items-end gap-2">
                            <input ref={fileRef} type="file" hidden onChange={onAttach} data-testid="chat-file-input" />
                            <Button data-testid="chat-attach-btn" variant="ghost" size="icon" disabled={uploading} onClick={() => fileRef.current?.click()}>
                                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                            </Button>
                            <Input
                                data-testid="chat-message-input"
                                value={text}
                                onChange={(e) => onTextChange(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                                placeholder="Type a secure message…"
                                className="flex-1"
                            />
                            <Button data-testid="chat-send-btn" onClick={send} disabled={!text.trim()}>
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
