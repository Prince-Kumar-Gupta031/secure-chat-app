import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function Register() {
    const [form, setForm] = useState({
        full_name: "", mobile: "", employee_id: "", department: "", password: "",
    });
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const nav = useNavigate();

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        if (form.password.length < 4) { toast.error("Password too short"); return; }
        setLoading(true);
        try {
            await api.post("/auth/register", form);
            setSuccess(true);
            toast.success("Registration submitted");
        } catch (err) {
            toast.error(err.response?.data?.detail || "Registration failed");
        } finally { setLoading(false); }
    };

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 bg-background">
                <div className="max-w-md w-full border border-border bg-card p-8 rounded-md">
                    <CheckCircle2 className="h-10 w-10 text-success mb-4" />
                    <h2 className="font-heading font-bold text-2xl mb-2">Request Submitted</h2>
                    <p className="text-sm text-muted-foreground mb-6">Your account is awaiting administrator approval. You will be able to sign in once approved.</p>
                    <Button data-testid="register-back-to-login" className="w-full font-mono uppercase tracking-wider" onClick={() => nav("/login")}>Back to Sign-In</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen grid md:grid-cols-2 bg-background">
            <div className="hidden md:flex relative items-end p-12 bg-secondary overflow-hidden">
                <div className="absolute inset-0 tactical-grid opacity-40" />
                <div className="absolute inset-0 bg-gradient-to-tr from-background via-transparent to-accent/10" />
                <div className="relative z-10 max-w-md">
                    <div className="flex items-center gap-3 mb-8">
                        <Shield className="h-6 w-6 text-accent" />
                        <div className="font-heading font-black">DRDO SECURE</div>
                    </div>
                    <h1 className="font-heading font-black text-4xl mb-3 leading-tight">Personnel Registration</h1>
                    <p className="text-muted-foreground text-sm">Submit your credentials. An administrator will verify your identity before granting LAN access.</p>
                </div>
            </div>

            <div className="flex items-center justify-center p-8 md:p-12 overflow-y-auto">
                <div className="w-full max-w-sm py-8">
                    <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-accent mb-3">/// REGISTER</div>
                    <h2 className="font-heading font-bold text-3xl mb-6">Request Access</h2>

                    <form onSubmit={submit} className="space-y-4">
                        <div className="space-y-2">
                            <Label className="font-mono text-[11px] uppercase tracking-wider">Full Name</Label>
                            <Input data-testid="reg-fullname" value={form.full_name} onChange={set("full_name")} required />
                        </div>
                        <div className="space-y-2">
                            <Label className="font-mono text-[11px] uppercase tracking-wider">Mobile Number</Label>
                            <Input data-testid="reg-mobile" value={form.mobile} onChange={set("mobile")} required />
                        </div>
                        <div className="space-y-2">
                            <Label className="font-mono text-[11px] uppercase tracking-wider">Employee ID</Label>
                            <Input data-testid="reg-empid" value={form.employee_id} onChange={set("employee_id")} required />
                        </div>
                        <div className="space-y-2">
                            <Label className="font-mono text-[11px] uppercase tracking-wider">Department</Label>
                            <Input data-testid="reg-dept" value={form.department} onChange={set("department")} required placeholder="e.g. Research, HR" />
                        </div>
                        <div className="space-y-2">
                            <Label className="font-mono text-[11px] uppercase tracking-wider">Password</Label>
                            <Input data-testid="reg-password" type="password" value={form.password} onChange={set("password")} required />
                        </div>
                        <Button data-testid="reg-submit" type="submit" disabled={loading} className="w-full font-mono uppercase tracking-wider">
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Request"}
                        </Button>
                    </form>

                    <div className="mt-6 text-sm text-muted-foreground">
                        Already registered? <Link to="/login" className="text-accent hover:underline font-medium" data-testid="reg-login-link">Sign in</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
