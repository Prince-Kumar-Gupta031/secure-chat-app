import { useEffect, useState } from "react";
import api, { BACKEND_URL } from "@/lib/apiClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Users, Search } from "lucide-react";
import { toast } from "sonner";

export default function GroupCreateDialog({ open, onOpenChange, onCreated }) {
    const [name, setName] = useState("");
    const [users, setUsers] = useState([]);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState({});
    const [saving, setSaving] = useState(false);
    const [iconFile, setIconFile] = useState(null);

    useEffect(() => {
        if (!open) return;
        setName(""); setSelected({}); setIconFile(null); setSearch("");
        api.get("/users").then(({ data }) => setUsers(data)).catch(() => {});
    }, [open]);

    const filtered = users.filter((u) => {
        if (!search) return true;
        const s = search.toLowerCase();
        return u.full_name.toLowerCase().includes(s)
            || u.employee_id.toLowerCase().includes(s)
            || (u.department || "").toLowerCase().includes(s);
    });

    const selectedCount = Object.values(selected).filter(Boolean).length;

    const create = async () => {
        if (!name.trim()) { toast.error("Group name is required"); return; }
        const participant_ids = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
        if (participant_ids.length === 0) { toast.error("Add at least one member"); return; }
        setSaving(true);
        try {
            let icon_url = null;
            if (iconFile) {
                const fd = new FormData(); fd.append("file", iconFile);
                const { data } = await api.post("/files/profile-picture", fd,
                    { headers: { "Content-Type": "multipart/form-data" } });
                icon_url = data.url;
            }
            const { data } = await api.post("/groups", {
                name: name.trim(), icon: icon_url, participant_ids,
            });
            toast.success(`Group "${data.group_name}" created`);
            onCreated?.(data);
            onOpenChange(false);
        } catch (err) {
            toast.error(err.response?.data?.detail || "Could not create group");
        } finally { setSaving(false); }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md p-0 overflow-hidden">
                <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
                    <DialogTitle className="font-heading flex items-center gap-2">
                        <Users className="h-5 w-5 text-accent" /> New Group
                    </DialogTitle>
                    <DialogDescription className="font-mono text-[10px] uppercase tracking-wider">
                        Create a group conversation. You become the group admin.
                    </DialogDescription>
                </DialogHeader>

                <div className="px-5 py-4 space-y-4">
                    <div className="flex items-center gap-3">
                        <label className="cursor-pointer">
                            <Avatar className="h-14 w-14 border border-border">
                                {iconFile ? <AvatarImage src={URL.createObjectURL(iconFile)} /> : null}
                                <AvatarFallback className="bg-muted"><Users className="h-5 w-5 text-muted-foreground" /></AvatarFallback>
                            </Avatar>
                            <input data-testid="group-icon-input" type="file" accept="image/*" hidden onChange={(e) => setIconFile(e.target.files?.[0] || null)} />
                        </label>
                        <div className="flex-1 space-y-1.5">
                            <Label className="font-mono text-[10px] uppercase tracking-wider">Group Name</Label>
                            <Input data-testid="group-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Research Wing" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="font-mono text-[10px] uppercase tracking-wider flex items-center justify-between">
                            <span>Add Members</span>
                            <span className="text-accent">{selectedCount} selected</span>
                        </Label>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input data-testid="group-member-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search personnel…" className="pl-8 h-9" />
                        </div>
                        <ScrollArea className="h-56 border border-border rounded-md">
                            {filtered.length === 0 ? (
                                <div className="p-4 text-center text-xs text-muted-foreground">No personnel.</div>
                            ) : filtered.map((u) => (
                                <label key={u.id} data-testid={`group-member-row-${u.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-muted cursor-pointer border-b border-border/50 last:border-b-0">
                                    <Checkbox checked={!!selected[u.id]} onCheckedChange={(v) => setSelected((s) => ({ ...s, [u.id]: !!v }))} />
                                    <Avatar className="h-8 w-8 border border-border">
                                        {u.profile_picture && <AvatarImage src={`${BACKEND_URL}${u.profile_picture}`} />}
                                        <AvatarFallback className="text-[10px] font-mono bg-muted">{u.full_name.split(" ").map(s=>s[0]).slice(0,2).join("")}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm truncate font-medium">{u.full_name}</div>
                                        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground truncate">{u.employee_id} · {u.department}</div>
                                    </div>
                                </label>
                            ))}
                        </ScrollArea>
                    </div>
                </div>

                <DialogFooter className="px-5 py-3 border-t border-border bg-muted/30">
                    <Button data-testid="group-cancel-btn" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button data-testid="group-create-btn" onClick={create} disabled={saving} className="font-mono uppercase tracking-wider">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Create Group
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
