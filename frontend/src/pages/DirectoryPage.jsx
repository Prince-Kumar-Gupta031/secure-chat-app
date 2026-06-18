import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { BACKEND_URL } from "@/lib/apiClient";
import { useSocket } from "@/contexts/SocketContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, MessageSquare, Circle } from "lucide-react";
import { toast } from "sonner";

export default function DirectoryPage() {
    const [q, setQ] = useState("");
    const [users, setUsers] = useState([]);
    const nav = useNavigate();
    const { presence } = useSocket();

    const load = async (query = "") => {
        const { data } = await api.get("/users", { params: query ? { q: query } : {} });
        setUsers(data);
    };

    useEffect(() => { load(); }, []);

    useEffect(() => {
        const t = setTimeout(() => load(q), 250);
        return () => clearTimeout(t);
    }, [q]);

    const startChat = async (peer) => {
        try {
            const { data } = await api.post("/chats", null, { params: { peer_id: peer.id } });
            nav(`/chat/${data.id}`);
        } catch (err) {
            toast.error(err.response?.data?.detail || "Could not open chat");
        }
    };

    return (
        <div className="flex-1 flex flex-col">
            <div className="border-b border-border bg-card px-6 py-5">
                <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-accent mb-1">/// PERSONNEL</div>
                <h2 className="font-heading font-bold text-2xl">Employee Directory</h2>
                <p className="text-sm text-muted-foreground mt-1">Search authorised personnel by name, employee ID, or department.</p>
                <div className="relative mt-4 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input data-testid="directory-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, ID or department…" className="pl-10" />
                </div>
            </div>

            <ScrollArea className="flex-1 p-6">
                {users.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-12">No personnel found.</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-6xl">
                        {users.map((u) => {
                            const online = presence[u.id]?.online ?? u.online;
                            return (
                                <div key={u.id} data-testid={`dir-card-${u.id}`} className="border border-border bg-card p-4 rounded-md flex items-center gap-3">
                                    <div className="relative">
                                        <Avatar className="h-11 w-11 border border-border">
                                            {u.profile_picture && <AvatarImage src={`${BACKEND_URL}${u.profile_picture}`} />}
                                            <AvatarFallback className="text-xs font-mono bg-muted">{u.full_name.split(" ").map(s => s[0]).slice(0,2).join("")}</AvatarFallback>
                                        </Avatar>
                                        {online && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success border-2 border-card" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-sm truncate">{u.full_name}</div>
                                        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground truncate">{u.employee_id} · {u.department}</div>
                                        <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                            <Circle className={`h-1.5 w-1.5 ${online ? "fill-success text-success" : "fill-muted-foreground text-muted-foreground"}`} />
                                            {online ? "Online" : "Offline"}
                                        </div>
                                    </div>
                                    <Button data-testid={`dir-chat-btn-${u.id}`} size="sm" variant="outline" onClick={() => startChat(u)}>
                                        <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Chat
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
