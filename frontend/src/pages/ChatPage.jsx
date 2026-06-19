import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { BACKEND_URL } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { useSocket } from "@/contexts/SocketContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Paperclip, Search, Circle, Loader2, MessageSquare, X, Users, Plus, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import MessageBubble from "@/components/chat/MessageBubble";
import GroupCreateDialog from "@/components/chat/GroupCreateDialog";
import GroupInfoDialog from "@/components/chat/GroupInfoDialog";

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
    const [msgSearch, setMsgSearch] = useState("");
    const [peerTyping, setPeerTyping] = useState({}); // userId -> typing
    const [uploading, setUploading] = useState(false);
    const [showGroupCreate, setShowGroupCreate] = useState(false);
    const [showGroupInfo, setShowGroupInfo] = useState(false);
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
        else api.get(`/chats/${chatId}`).then(({ data }) => setActiveChat(data)).catch(() => {});

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
                setMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
                if (msg.sender_id !== user.id) {
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
            if (!activeChat) return;
            if (t.chat_id && t.chat_id !== activeChat.id) return;
            if (!t.chat_id && activeChat.is_group) return;
            if (!t.chat_id && activeChat.peer?.id !== t.user_id) return;
            setPeerTyping((prev) => ({ ...prev, [t.user_id]: t.typing }));
            if (t.typing) {
                setTimeout(() => setPeerTyping((prev) => ({ ...prev, [t.user_id]: false })), 3500);
            }
        });
        const offChatUpdated = on("chatUpdated", () => { loadChats(); if (activeChat) {
            api.get(`/chats/${activeChat.id}`).then(({ data }) => setActiveChat(data)).catch(() => {});
        }});
        return () => { offMsg(); offStatus(); offRead(); offTyping(); offChatUpdated(); };
    }, [on, activeChat, user.id, loadChats]);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    const send = async () => {
        if (!activeChat || !text.trim()) return;
        const trimmed = text.trim();
        setText("");
        if (activeChat.is_group) sendTyping({ chat_id: activeChat.id, typing: false });
        else sendTyping({ peer_id: activeChat.peer.id, typing: false });
        const payload = activeChat.is_group
            ? { chat_id: activeChat.id, text: trimmed }
            : { peer_id: activeChat.peer.id, text: trimmed };
        const ack = await sendMessage(payload);
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
            const payload = activeChat.is_group
                ? { chat_id: activeChat.id, attachment: data }
                : { peer_id: activeChat.peer.id, attachment: data };
            const ack = await sendMessage(payload);
            if (ack?.error) toast.error(ack.error);
        } catch (err) {
            toast.error(err.response?.data?.detail || "Upload failed");
        } finally { setUploading(false); }
    };

    const onTextChange = (v) => {
        setText(v);
        if (!activeChat) return;
        const opts = activeChat.is_group
            ? { chat_id: activeChat.id, typing: true }
            : { peer_id: activeChat.peer.id, typing: true };
        sendTyping(opts);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => {
            sendTyping({ ...opts, typing: false });
        }, 1500);
    };

    const filtered = chats.filter((c) => {
        if (!search) return true;
        const s = search.toLowerCase();
        if (c.is_group) return c.group_name?.toLowerCase().includes(s);
        return c.peer?.full_name?.toLowerCase().includes(s) || c.peer?.employee_id?.toLowerCase().includes(s);
    });

    const peerOnline = activeChat && !activeChat.is_group && (presence[activeChat.peer?.id]?.online ?? activeChat.peer?.online);
    const peerLastSeen = activeChat && !activeChat.is_group && (presence[activeChat.peer?.id]?.last_seen ?? activeChat.peer?.last_seen);
    const typingNames = activeChat && activeChat.is_group
        ? Object.entries(peerTyping).filter(([, v]) => v).map(([uid]) => {
            const m = activeChat.members?.find((x) => x.id === uid);
            return m?.full_name?.split(" ")[0] || "Someone";
        })
        : peerTyping[activeChat?.peer?.id] ? ["Typing"] : [];
    const isTypingNow = typingNames.length > 0;

    const filteredMessages = msgSearch
        ? messages.filter((m) => m.text?.toLowerCase().includes(msgSearch.toLowerCase()))
        : messages;

    const memberNameById = activeChat?.is_group
        ? Object.fromEntries((activeChat.members || []).map((m) => [m.id, m.full_name]))
        : {};

    return (
        <div className="flex flex-1 min-h-0 w-full">
            {/* Sidebar */}
            <div className={`${chatId ? "hidden md:flex" : "flex"} md:w-80 w-full border-r border-border bg-card flex-col shrink-0`}>
                <div className="p-3 md:p-4 border-b border-border">
                    <div className="flex items-center justify-between mb-2">
                        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">CONVERSATIONS</div>
                        <Button data-testid="new-group-btn" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowGroupCreate(true)} title="New group">
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input data-testid="chat-search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats & groups…" className="pl-8 h-9 text-sm" />
                    </div>
                </div>
                <ScrollArea className="flex-1">
                    {filtered.length === 0 && (
                        <div className="p-6 text-center text-sm text-muted-foreground">
                            No conversations yet.{" "}
                            <button onClick={() => nav("/directory")} className="text-accent hover:underline">Open directory</button>{" "}or{" "}
                            <button onClick={() => setShowGroupCreate(true)} className="text-accent hover:underline">create group</button>.
                        </div>
                    )}
                    {filtered.map((c) => {
                        const isActive = c.id === chatId;
                        const isGroup = c.is_group;
                        const online = !isGroup && (presence[c.peer?.id]?.online ?? c.peer?.online);
                        const title = isGroup ? c.group_name : c.peer?.full_name;
                        const subtitle = isGroup ? `${c.participants.length} members` : c.peer?.employee_id;
                        const icon = isGroup ? c.group_icon : c.peer?.profile_picture;
                        const fallback = isGroup
                            ? <Users className="h-4 w-4 text-muted-foreground" />
                            : (c.peer?.full_name?.split(" ").map(s => s[0]).slice(0,2).join("") || "?");
                        return (
                            <button
                                key={c.id}
                                data-testid={`chat-item-${c.id}`}
                                onClick={() => nav(`/chat/${c.id}`)}
                                className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-border/50 transition-colors ${isActive ? "bg-accent/10" : "hover:bg-muted"}`}
                            >
                                <div className="relative">
                                    <Avatar className="h-10 w-10 border border-border">
                                        {icon && <AvatarImage src={`${BACKEND_URL}${icon}`} />}
                                        <AvatarFallback className="text-xs font-mono bg-muted">{fallback}</AvatarFallback>
                                    </Avatar>
                                    {!isGroup && online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success border-2 border-card" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                                            {isGroup && <Users className="h-3 w-3 text-muted-foreground shrink-0" />}
                                            {title}
                                        </div>
                                        {c.last_message_at && <div className="font-mono text-[10px] text-muted-foreground shrink-0">{dayjs(c.last_message_at).format("HH:mm")}</div>}
                                    </div>
                                    <div className="flex items-center justify-between gap-2 mt-0.5">
                                        <div className="text-xs text-muted-foreground truncate">{c.last_message_preview || subtitle}</div>
                                        {c.unread > 0 && <div className="bg-accent text-accent-foreground text-[10px] font-mono font-bold rounded-full px-1.5 min-w-[18px] h-[18px] flex items-center justify-center">{c.unread}</div>}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </ScrollArea>
            </div>

            {/* Chat window */}
            <div className={`${chatId ? "flex" : "hidden md:flex"} flex-1 flex-col min-w-0 bg-background`}>
                {!activeChat ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                        <div className="h-16 w-16 rounded-md bg-accent/10 border border-accent/30 flex items-center justify-center mb-4">
                            <MessageSquare className="h-7 w-7 text-accent" strokeWidth={1.5} />
                        </div>
                        <h3 className="font-heading font-bold text-xl mb-1">Select a conversation</h3>
                        <p className="text-sm text-muted-foreground max-w-sm">Pick a chat on the left, open the <button className="text-accent hover:underline" onClick={() => nav("/directory")}>Employee Directory</button>, or <button className="text-accent hover:underline" onClick={() => setShowGroupCreate(true)}>create a group</button>.</p>
                        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mt-6 flex items-center gap-2">
                            <Circle className={`h-2 w-2 ${connected ? "fill-success text-success" : "fill-destructive text-destructive"}`} />
                            {connected ? "SOCKET CONNECTED" : "SOCKET DISCONNECTED"}
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="px-3 md:px-5 py-3 border-b border-border bg-card flex items-center gap-2 md:gap-3">
                            <Button data-testid="chat-back-btn" variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => nav("/chat")}>
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <button
                                data-testid="chat-header-info"
                                className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-80 transition"
                                onClick={() => { if (activeChat.is_group) setShowGroupInfo(true); }}
                            >
                                <Avatar className="h-9 w-9 border border-border shrink-0">
                                    {activeChat.is_group
                                        ? (activeChat.group_icon ? <AvatarImage src={`${BACKEND_URL}${activeChat.group_icon}`} /> : null)
                                        : (activeChat.peer?.profile_picture ? <AvatarImage src={`${BACKEND_URL}${activeChat.peer.profile_picture}`} /> : null)
                                    }
                                    <AvatarFallback className="text-xs font-mono bg-muted">
                                        {activeChat.is_group
                                            ? <Users className="h-4 w-4 text-muted-foreground" />
                                            : activeChat.peer?.full_name?.split(" ").map(s => s[0]).slice(0,2).join("")}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-sm truncate">
                                        {activeChat.is_group ? activeChat.group_name : activeChat.peer?.full_name}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 truncate">
                                        {isTypingNow ? (
                                            <span className="text-accent">{activeChat.is_group ? `${typingNames.join(", ")} typing…` : "typing…"}</span>
                                        ) : activeChat.is_group ? (
                                            <span className="truncate">{activeChat.participants.length} members</span>
                                        ) : peerOnline ? (
                                            <><Circle className="h-1.5 w-1.5 fill-success text-success" /> Online</>
                                        ) : peerLastSeen ? (
                                            <>Last seen {dayjs(peerLastSeen).fromNow()}</>
                                        ) : (
                                            <>Offline</>
                                        )}
                                    </div>
                                </div>
                            </button>
                            <div className="relative hidden sm:block">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input data-testid="chat-msg-search" value={msgSearch} onChange={(e) => setMsgSearch(e.target.value)} placeholder="Search messages…" className="pl-7 h-8 w-44 text-xs" />
                            </div>
                            <Button data-testid="close-chat-btn" variant="ghost" size="icon" className="h-8 w-8 hidden md:inline-flex" onClick={() => nav("/chat")}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        <ScrollArea className="flex-1 px-3 md:px-5 py-4 overflow-x-hidden">
                            <div className="space-y-2 max-w-3xl mx-auto w-full">
                                {filteredMessages.map((m) => (
                                    <MessageBubble
                                        key={m.id}
                                        message={m}
                                        isOwn={m.sender_id === user.id}
                                        showSender={activeChat.is_group}
                                        senderName={memberNameById[m.sender_id]}
                                    />
                                ))}
                                {isTypingNow && (
                                    <div className="flex justify-start">
                                        <div className="px-3 py-2 rounded-md bg-bubble-received border border-border text-xs text-muted-foreground font-mono">
                                            {activeChat.is_group ? `${typingNames.join(", ")} typing…` : "typing…"}
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        </ScrollArea>

                        <div className="border-t border-border bg-card p-2 md:p-3 flex items-end gap-2">
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
                                className="flex-1 min-w-0"
                            />
                            <Button data-testid="chat-send-btn" onClick={send} disabled={!text.trim()}>
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                    </>
                )}
            </div>

            <GroupCreateDialog open={showGroupCreate} onOpenChange={setShowGroupCreate} onCreated={(c) => { loadChats(); nav(`/chat/${c.id}`); }} />
            {activeChat?.is_group && <GroupInfoDialog open={showGroupInfo} onOpenChange={setShowGroupInfo} chat={activeChat} onChanged={(c) => { loadChats(); if (c === null) nav("/chat"); else setActiveChat(c); }} />}
        </div>
    );
}
