import { useState, useRef } from "react";
import api, { BACKEND_URL } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Upload, KeyRound, Save, Loader2 } from "lucide-react";

export default function ProfilePage() {
    const { user, refresh } = useAuth();
    const fileRef = useRef(null);
    const [name, setName] = useState(user?.full_name || "");
    const [dept, setDept] = useState(user?.department || "");
    const [mobile, setMobile] = useState(user?.mobile || "");
    const [pwdCur, setPwdCur] = useState("");
    const [pwdNew, setPwdNew] = useState("");
    const [saving, setSaving] = useState(false);
    const [changingPwd, setChangingPwd] = useState(false);
    const [uploading, setUploading] = useState(false);

    const onAvatar = async (e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (!f) return;
        setUploading(true);
        try {
            const fd = new FormData(); fd.append("file", f);
            await api.post("/files/profile-picture", fd, { headers: { "Content-Type": "multipart/form-data" } });
            await refresh();
            toast.success("Profile picture updated");
        } catch (err) {
            toast.error(err.response?.data?.detail || "Upload failed");
        } finally { setUploading(false); }
    };

    const save = async () => {
        setSaving(true);
        try {
            await api.put("/auth/profile", { full_name: name, department: dept, mobile });
            await refresh();
            toast.success("Profile saved");
        } catch (err) {
            toast.error(err.response?.data?.detail || "Save failed");
        } finally { setSaving(false); }
    };

    const changePwd = async () => {
        if (pwdNew.length < 4) { toast.error("Password too short"); return; }
        setChangingPwd(true);
        try {
            await api.post("/auth/change-password", { current_password: pwdCur, new_password: pwdNew });
            setPwdCur(""); setPwdNew("");
            await refresh();
            toast.success("Password updated");
        } catch (err) {
            toast.error(err.response?.data?.detail || "Could not change password");
        } finally { setChangingPwd(false); }
    };

    return (
        <ScrollArea className="flex-1">
            <div className="max-w-3xl mx-auto p-6 md:p-10">
                <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-accent mb-1">/// IDENTITY</div>
                <h2 className="font-heading font-bold text-2xl mb-6">Profile</h2>

                {user?.must_change_password && (
                    <div className="border border-destructive/40 bg-destructive/10 rounded-md p-4 mb-6 text-sm">
                        <strong className="font-mono uppercase tracking-wider text-xs">Action required:</strong> Please change your default password.
                    </div>
                )}

                <div className="border border-border bg-card rounded-md p-6 mb-6">
                    <div className="flex items-center gap-4 mb-6">
                        <Avatar className="h-20 w-20 border border-border">
                            {user?.profile_picture && <AvatarImage src={`${BACKEND_URL}${user.profile_picture}`} />}
                            <AvatarFallback className="text-lg font-mono bg-muted">{user?.full_name?.split(" ").map(s => s[0]).slice(0,2).join("")}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                            <div className="font-heading font-bold text-lg">{user?.full_name}</div>
                            <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{user?.employee_id} · {user?.role}</div>
                            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatar} data-testid="profile-avatar-input" />
                            <Button data-testid="profile-upload-btn" variant="outline" size="sm" className="mt-2" onClick={() => fileRef.current?.click()} disabled={uploading}>
                                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                                Change photo
                            </Button>
                        </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="font-mono text-[11px] uppercase tracking-wider">Full Name</Label>
                            <Input data-testid="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label className="font-mono text-[11px] uppercase tracking-wider">Mobile Number</Label>
                            <Input data-testid="profile-mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label className="font-mono text-[11px] uppercase tracking-wider">Department</Label>
                            <Input data-testid="profile-dept" value={dept} onChange={(e) => setDept(e.target.value)} />
                        </div>
                    </div>
                    <Button data-testid="profile-save-btn" className="mt-5 font-mono uppercase tracking-wider" onClick={save} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Save changes
                    </Button>
                </div>

                <div className="border border-border bg-card rounded-md p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <KeyRound className="h-4 w-4 text-accent" />
                        <div className="font-heading font-bold">Change Password</div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="font-mono text-[11px] uppercase tracking-wider">Current Password</Label>
                            <Input data-testid="profile-current-pwd" type="password" value={pwdCur} onChange={(e) => setPwdCur(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label className="font-mono text-[11px] uppercase tracking-wider">New Password</Label>
                            <Input data-testid="profile-new-pwd" type="password" value={pwdNew} onChange={(e) => setPwdNew(e.target.value)} />
                        </div>
                    </div>
                    <Button data-testid="profile-change-pwd-btn" className="mt-5 font-mono uppercase tracking-wider" onClick={changePwd} disabled={changingPwd || !pwdCur || !pwdNew}>
                        {changingPwd ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Update password
                    </Button>
                </div>
            </div>
        </ScrollArea>
    );
}
