import { Link } from "react-router-dom";
import { Shield, MessageSquareLock, Network, Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Landing() {
    return (
        <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
            <div className="absolute inset-0 tactical-grid opacity-30 pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/30 to-background pointer-events-none" />

            <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5 border-b border-border/60">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-md bg-accent/10 border border-accent/40 flex items-center justify-center">
                        <Shield className="h-5 w-5 text-accent" strokeWidth={2.2} />
                    </div>
                    <div>
                        <div className="font-heading font-black text-base tracking-tight">DRDO SECURE</div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">LAN COMMS // CLASSIFIED</div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Link to="/login"><Button data-testid="landing-login-btn" variant="ghost" className="font-mono uppercase tracking-wider text-xs">Sign In</Button></Link>
                    <Link to="/register"><Button data-testid="landing-register-btn" className="font-mono uppercase tracking-wider text-xs">Request Access <ArrowRight className="ml-2 h-3 w-3" /></Button></Link>
                </div>
            </header>

            <section className="relative z-10 px-6 md:px-12 py-16 md:py-24 max-w-6xl">
                <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-accent mb-5 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-dot" />
                    INTERNAL NETWORK // AIR-GAPPED READY
                </div>
                <h1 className="font-heading font-black text-5xl md:text-7xl tracking-tight leading-[1.02] mb-6">
                    Encrypted comms<br/>for the people who<br/><span className="text-accent">defend the nation.</span>
                </h1>
                <p className="text-muted-foreground text-base md:text-lg max-w-2xl mb-10 leading-relaxed">
                    A WhatsApp-grade messaging platform engineered for DRDO&apos;s internal LAN. Real-time chat, presence, delivery receipts, encrypted media transfer — built to operate fully offline, fully sovereign.
                </p>
                <div className="flex flex-wrap gap-3">
                    <Link to="/register"><Button data-testid="landing-cta-register" size="lg" className="font-mono uppercase tracking-wider">Request Personnel Access</Button></Link>
                    <Link to="/login"><Button data-testid="landing-cta-login" size="lg" variant="outline" className="font-mono uppercase tracking-wider">Operator Sign-In</Button></Link>
                </div>

                <div className="grid md:grid-cols-3 gap-px bg-border mt-20 border border-border">
                    {[
                        { icon: MessageSquareLock, t: "Zero-Trust Messaging", d: "Admin cannot read message contents. Only sender and recipient." },
                        { icon: Network, t: "LAN-First Architecture", d: "Runs entirely on internal network. No cloud, no external endpoints." },
                        { icon: Lock, t: "Military Hardened", d: "bcrypt, JWT, RBAC, audit logs, rate-limiting, file-type policy." },
                    ].map((f) => (
                        <div key={f.t} className="bg-background p-6 md:p-8 hover:bg-muted/40 transition-colors duration-200">
                            <f.icon className="h-5 w-5 text-accent mb-4" strokeWidth={1.6} />
                            <div className="font-heading font-bold mb-2">{f.t}</div>
                            <div className="text-sm text-muted-foreground">{f.d}</div>
                        </div>
                    ))}
                </div>
            </section>

            <footer className="relative z-10 border-t border-border/60 px-6 md:px-12 py-6 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground flex justify-between">
                <div>Defence Research & Development Organisation</div>
                <div>v1.0 // PHASE-1</div>
            </footer>
        </div>
    );
}
