import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
    const [mobile, setMobile] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const nav = useNavigate();

    const onSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const u = await login(mobile.trim(), password);
            toast.success(`Authenticated as ${u.full_name}`);
            if (["admin", "super_admin"].includes(u.role)) nav("/admin");
            else nav("/chat");
        } catch (err) {
            const msg = err.response?.data?.detail || "Authentication failed";
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid md:grid-cols-2 bg-background">
            <div className="hidden md:flex relative items-end p-12 bg-secondary overflow-hidden">
                <div className="absolute inset-0 tactical-grid opacity-40" />
                <div className="absolute inset-0 bg-gradient-to-tr from-background via-transparent to-accent/10" />
                <div className="relative z-10 max-w-md">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="h-10 w-10 rounded-md bg-accent/10 border border-accent/40 flex items-center justify-center">
                            <Shield className="h-6 w-6 text-accent" strokeWidth={2.2} />
                        </div>
                        <div>
                            <div className="font-heading font-black text-lg">DRDO SECURE</div>
                            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">LAN COMMS // CLASSIFIED</div>
                        </div>
                    </div>
                    <h1 className="font-heading font-black text-4xl leading-tight mb-3">Operator Sign-In</h1>
                    <p className="text-muted-foreground text-sm">
                        Authorised personnel only. This terminal is monitored. All actions are logged in immutable audit trails.
                    </p>
                </div>
            </div>

            <div className="flex items-center justify-center p-8 md:p-12">
                <div className="w-full max-w-sm">
                    <div className="md:hidden mb-8 flex items-center gap-3">
                        <Shield className="h-6 w-6 text-accent" />
                        <div className="font-heading font-black">DRDO SECURE</div>
                    </div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-accent mb-3">/// AUTHENTICATE</div>
                    <h2 className="font-heading font-bold text-3xl mb-2">Sign in</h2>
                    <p className="text-sm text-muted-foreground mb-8">Use your mobile number and password.</p>

                    <form onSubmit={onSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="mobile" className="font-mono text-[11px] uppercase tracking-wider">Mobile Number</Label>
                            <Input data-testid="login-mobile-input" id="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="e.g. 9876543210" required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="pwd" className="font-mono text-[11px] uppercase tracking-wider">Password</Label>
                            <Input data-testid="login-password-input" id="pwd" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        </div>
                        <Button data-testid="login-submit-btn" type="submit" disabled={loading} className="w-full font-mono uppercase tracking-wider">
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Authenticate"}
                        </Button>
                    </form>

                    <div className="mt-6 text-sm text-muted-foreground">
                        New personnel? <Link to="/register" className="text-accent hover:underline font-medium" data-testid="login-register-link">Request access</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
