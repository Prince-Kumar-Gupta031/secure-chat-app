import { useEffect, useState } from "react";
import api, { BACKEND_URL } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Users, UserPlus, UserMinus, Shield, LogOut, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

export default function GroupInfoDialog({ open, onOpenChange, chat, onChanged }) {
    const { user } = useAuth();
    const [info, setInfo] = useState(chat);
    const [editName, setEditName] = useState(false);
    const [name, setName] = useState(chat?.group_name || "");
    const [iconFile, setIconFile] = useState(null);
    const [addOpen, setAddOpen] = useState(false);
    const [allUsers, setAllUsers] = useState([]);
    const [selected, setSelected] = useState({});
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (chat) { setInfo(chat); setName(chat.group_name || ""); }
    }, [chat]);

    useEffect(() => {
        if (!addOpen) return;
        api.get("/users").then(({ data }) => setAllUsers(data));
        setSelected({});
    }, [addOpen]);

    if (!info) return null;

    const isAdmin = info.group_admins?.includes(user.id);
    const memberIds = new Set(info.participants);
    const candidates = allUsers.filter((u) => !memberIds.has(u.id));

    const reload = async () => {
        const { data } = await api.get(`/chats/${info.id}`);
        setInfo(data);
        onChanged?.(data);
    };

    const saveName = async () => {
        try {
            await api.put(`/groups/${info.id}`, { name });
            toast.success("Group renamed");
            setEditName(false);
            await reload();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed");
        }
    };

    const onIconChange = async (e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (!f) return;
        setIconFile(f); setBusy(true);
        try {
            const fd = new FormData(); fd.append("file", f);
            const { data: up } = await api.post("/files/profile-picture", fd, { headers: { "Content-Type": "multipart/form-data" } });
            await api.put(`/groups/${info.id}`, { icon: up.url });
            toast.success("Icon updated");
            await reload();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Icon update failed");
        } finally { setBusy(false); setIconFile(null); }
    };

    const addSelected = async () => {
        const ids = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
        if (!ids.length) return;
        setBusy(true);
        try {
            await api.post(`/groups/${info.id}/members`, { user_ids: ids });
            toast.success(`${ids.length} member(s) added`);
            setAddOpen(false);
            await reload();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Add failed");
        } finally { setBusy(false); }
    };

    const removeMember = async (uid) => {
        if (!window.confirm("Remove this member?")) return;
        try {
            await api.delete(`/groups/${info.id}/members/${uid}`);
            toast.success("Member removed");
            await reload();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed");
        }
    };

    const promote = async (uid) => {
        try {
            await api.post(`/groups/${info.id}/admins/${uid}`);
            toast.success("Promoted to admin");
            await reload();
        } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
    };

    const demote = async (uid) => {
        try {
            await api.delete(`/groups/${info.id}/admins/${uid}`);
            toast.success("Demoted");
            await reload();
        } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
    };

    const leave = async () => {
        if (!window.confirm(`Leave "${info.group_name}"?`)) return;
        try {
            await api.post(`/groups/${info.id}/leave`);
            toast.success("Left group");
            onOpenChange(false);
            onChanged?.(null);
        } catch (err) { toast.error(err.response?.data?.detail || "Failed"); }
    };

    return (
        <>
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md p-0 overflow-hidden">
                <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
                    <DialogTitle className="font-heading flex items-center gap-2">
                        <Users className="h-5 w-5 text-accent" /> Group Info
                    </DialogTitle>
                </DialogHeader>
                <div className="px-5 py-4 space-y-4">
                    <div className="flex items-center gap-3">
                        <label className={isAdmin ? "cursor-pointer" : ""}>
                            <Avatar className="h-16 w-16 border border-border">
                                {info.group_icon && <AvatarImage src={`${BACKEND_URL}${info.group_icon}`} />}
                                <AvatarFallback className="bg-muted"><Users className="h-6 w-6 text-muted-foreground" /></AvatarFallback>
                            </Avatar>
                            {isAdmin && <input type="file" accept="image/*" hidden onChange={onIconChange} data-testid="group-info-icon-input" />}
                        </label>
                        <div className="flex-1 min-w-0">
                            {editName ? (
                                <div className="flex items-center gap-1">
                                    <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveName}><Check className="h-4 w-4 text-success" /></Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditName(false); setName(info.group_name); }}><X className="h-4 w-4" /></Button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <div className="font-heading font-bold text-lg truncate" data-testid="group-info-name">{info.group_name}</div>
                                    {isAdmin && (
                                        <Button data-testid="group-edit-name-btn" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditName(true)}>
                                            <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                </div>
                            )}
                            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{info.participants.length} members</div>
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <Label className="font-mono text-[10px] uppercase tracking-wider">Members</Label>
                            {isAdmin && (
                                <Button data-testid="group-add-members-btn" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddOpen(true)}>
                                    <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Add
                                </Button>
                            )}
                        </div>
                        <ScrollArea className="h-56 border border-border rounded-md">
                            {(info.members || []).map((m) => {
                                const isMemberAdmin = info.group_admins?.includes(m.id);
                                const isSelf = m.id === user.id;
                                return (
                                    <div key={m.id} data-testid={`group-member-${m.id}`} className="flex items-center gap-3 px-3 py-2 border-b border-border/50 last:border-b-0">
                                        <Avatar className="h-8 w-8 border border-border">
                                            {m.profile_picture && <AvatarImage src={`${BACKEND_URL}${m.profile_picture}`} />}
                                            <AvatarFallback className="text-[10px] font-mono bg-muted">{m.full_name.split(" ").map(s=>s[0]).slice(0,2).join("")}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate flex items-center gap-1.5">
                                                {m.full_name} {isSelf && <span className="text-[10px] text-muted-foreground">(you)</span>}
                                                {isMemberAdmin && <Badge variant="outline" className="text-[9px] font-mono uppercase border-accent/40 text-accent h-4 px-1">Admin</Badge>}
                                            </div>
                                            <div className="font-mono text-[10px] uppercase text-muted-foreground truncate">{m.employee_id}</div>
                                        </div>
                                        {isAdmin && !isSelf && (
                                            <div className="flex gap-1">
                                                {isMemberAdmin ? (
                                                    <Button data-testid={`demote-${m.id}`} size="icon" variant="ghost" className="h-7 w-7" onClick={() => demote(m.id)} title="Demote">
                                                        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                                                    </Button>
                                                ) : (
                                                    <Button data-testid={`promote-${m.id}`} size="icon" variant="ghost" className="h-7 w-7" onClick={() => promote(m.id)} title="Make admin">
                                                        <Shield className="h-3.5 w-3.5 text-accent" />
                                                    </Button>
                                                )}
                                                <Button data-testid={`kick-${m.id}`} size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeMember(m.id)} title="Remove">
                                                    <UserMinus className="h-3.5 w-3.5 text-destructive" />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </ScrollArea>
                    </div>
                </div>
                <DialogFooter className="px-5 py-3 border-t border-border bg-muted/30">
                    <Button data-testid="group-leave-btn" variant="ghost" className="text-destructive" onClick={leave}>
                        <LogOut className="h-4 w-4 mr-1.5" /> Leave Group
                    </Button>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>
                {busy && <div className="absolute inset-0 bg-background/40 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}
            </DialogContent>
        </Dialog>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogContent className="max-w-md p-0 overflow-hidden">
                <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
                    <DialogTitle className="font-heading">Add Members</DialogTitle>
                </DialogHeader>
                <ScrollArea className="max-h-72 px-3 py-2">
                    {candidates.length === 0 ? (
                        <div className="text-center text-xs text-muted-foreground py-6">No more personnel to add.</div>
                    ) : candidates.map((u) => (
                        <label key={u.id} data-testid={`add-candidate-${u.id}`} className="flex items-center gap-3 px-2 py-2 hover:bg-muted cursor-pointer rounded-sm">
                            <Checkbox checked={!!selected[u.id]} onCheckedChange={(v) => setSelected((s) => ({ ...s, [u.id]: !!v }))} />
                            <Avatar className="h-8 w-8 border border-border">
                                {u.profile_picture && <AvatarImage src={`${BACKEND_URL}${u.profile_picture}`} />}
                                <AvatarFallback className="text-[10px] font-mono bg-muted">{u.full_name.split(" ").map(s=>s[0]).slice(0,2).join("")}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm truncate">{u.full_name}</div>
                                <div className="font-mono text-[10px] uppercase text-muted-foreground truncate">{u.employee_id} · {u.department}</div>
                            </div>
                        </label>
                    ))}
                </ScrollArea>
                <DialogFooter className="px-5 py-3 border-t border-border">
                    <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
                    <Button data-testid="confirm-add-members-btn" onClick={addSelected} disabled={busy} className="font-mono uppercase tracking-wider">Add</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        </>
    );
}
