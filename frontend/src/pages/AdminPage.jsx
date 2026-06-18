import { useEffect, useState } from "react";
import api, { BACKEND_URL } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, UserCheck, UserX, Clock, Activity, HardDrive, Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function StatCard({ icon: Icon, label, value, sub }) {
    return (
        <div className="border border-border bg-card p-5 rounded-md">
            <div className="flex items-center justify-between mb-3">
                <Icon className="h-4 w-4 text-accent" strokeWidth={1.7} />
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</div>
            </div>
            <div className="font-heading font-black text-3xl">{value}</div>
            {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
        </div>
    );
}

const STATUS_BADGE = {
    pending: <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-mono uppercase text-[10px]">Pending</Badge>,
    approved: <Badge variant="outline" className="bg-success/10 text-success border-success/40 font-mono uppercase text-[10px]">Approved</Badge>,
    rejected: <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/40 font-mono uppercase text-[10px]">Rejected</Badge>,
    suspended: <Badge variant="outline" className="bg-muted-foreground/10 text-muted-foreground border-muted-foreground/30 font-mono uppercase text-[10px]">Suspended</Badge>,
};

export default function AdminPage() {
    const [analytics, setAnalytics] = useState(null);
    const [users, setUsers] = useState([]);
    const [logs, setLogs] = useState([]);
    const [tab, setTab] = useState("dashboard");
    const [actionId, setActionId] = useState(null);

    const load = async () => {
        try {
            const [a, u, l] = await Promise.all([
                api.get("/admin/analytics"),
                api.get("/admin/users"),
                api.get("/admin/audit-logs", { params: { limit: 50 } }),
            ]);
            setAnalytics(a.data); setUsers(u.data); setLogs(l.data);
        } catch (err) {
            toast.error("Failed to load admin data");
        }
    };

    useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

    const act = async (userId, action) => {
        setActionId(userId + action);
        try {
            if (action === "approve") await api.post(`/admin/users/${userId}/approve`);
            if (action === "reject") await api.post(`/admin/users/${userId}/reject`, { reason: "" });
            if (action === "suspend") await api.post(`/admin/users/${userId}/suspend`, { reason: "" });
            if (action === "reinstate") await api.post(`/admin/users/${userId}/reinstate`);
            toast.success(`User ${action}d`);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Action failed");
        } finally { setActionId(null); }
    };

    if (!analytics) return <div className="flex-1 flex items-center justify-center text-muted-foreground font-mono text-sm">LOADING DASHBOARD…</div>;

    const fmtSize = (b) => b > 1024*1024 ? `${(b/1024/1024).toFixed(1)} MB` : `${(b/1024).toFixed(1)} KB`;

    return (
        <ScrollArea className="flex-1">
            <div className="p-6 md:p-8 max-w-7xl">
                <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-accent mb-1">/// CONTROL ROOM</div>
                <h2 className="font-heading font-bold text-2xl mb-6">Admin Dashboard</h2>

                <Tabs value={tab} onValueChange={setTab}>
                    <TabsList className="mb-6 font-mono uppercase text-xs">
                        <TabsTrigger value="dashboard" data-testid="admin-tab-dashboard">Dashboard</TabsTrigger>
                        <TabsTrigger value="approvals" data-testid="admin-tab-approvals">
                            Approvals {analytics.pending_approvals > 0 && <span className="ml-2 bg-accent text-accent-foreground font-mono text-[10px] rounded-full px-1.5 min-w-[18px] h-[18px] inline-flex items-center justify-center">{analytics.pending_approvals}</span>}
                        </TabsTrigger>
                        <TabsTrigger value="users" data-testid="admin-tab-users">All Users</TabsTrigger>
                        <TabsTrigger value="logs" data-testid="admin-tab-logs">Audit Logs</TabsTrigger>
                    </TabsList>

                    <TabsContent value="dashboard" className="space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <StatCard icon={Users} label="Total Users" value={analytics.total_users} />
                            <StatCard icon={UserCheck} label="Active" value={analytics.active_users} />
                            <StatCard icon={Clock} label="Pending" value={analytics.pending_approvals} />
                            <StatCard icon={Activity} label="Online Now" value={analytics.online_users} />
                            <StatCard icon={HardDrive} label="Storage" value={fmtSize(analytics.storage_bytes)} sub={`${analytics.storage_files} files`} />
                            <StatCard icon={Building2} label="Departments" value={analytics.departments.length} />
                        </div>

                        <div className="border border-border bg-card rounded-md p-5">
                            <div className="flex items-center justify-between mb-4">
                                <div className="font-heading font-bold">Personnel by Department</div>
                                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">approved users</div>
                            </div>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={analytics.departments.slice(0, 12)}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                                        <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} allowDecimals={false} />
                                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 4, fontSize: 12 }} />
                                        <Bar dataKey="count" fill="hsl(var(--accent))" radius={[2, 2, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="approvals">
                        <UserTable users={users.filter(u => u.status === "pending")} act={act} actionId={actionId} showActions={["approve", "reject"]} />
                    </TabsContent>

                    <TabsContent value="users">
                        <UserTable users={users} act={act} actionId={actionId} showActions={["approve", "suspend", "reinstate", "reject"]} />
                    </TabsContent>

                    <TabsContent value="logs">
                        <div className="border border-border bg-card rounded-md overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="border-b border-border bg-muted/40">
                                    <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                        <th className="px-4 py-2.5">Time</th>
                                        <th className="px-4 py-2.5">Actor</th>
                                        <th className="px-4 py-2.5">Action</th>
                                        <th className="px-4 py-2.5">Target</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((l) => (
                                        <tr key={l.id} className="border-b border-border/50 hover:bg-muted/30">
                                            <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{dayjs(l.at).format("DD/MM HH:mm:ss")}</td>
                                            <td className="px-4 py-2 font-mono text-xs">{l.user_id?.slice(0, 8)}…</td>
                                            <td className="px-4 py-2"><span className="font-mono uppercase text-[10px] tracking-wider">{l.action}</span></td>
                                            <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{l.target?.slice(0, 8) || "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {logs.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No logs.</div>}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </ScrollArea>
    );
}

function UserTable({ users, act, actionId, showActions }) {
    return (
        <div className="border border-border bg-card rounded-md overflow-hidden">
            {users.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No users in this view.</div>
            ) : (
                <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted/40">
                        <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            <th className="px-4 py-2.5">User</th>
                            <th className="px-4 py-2.5">Employee ID</th>
                            <th className="px-4 py-2.5">Department</th>
                            <th className="px-4 py-2.5">Status</th>
                            <th className="px-4 py-2.5">Last Seen</th>
                            <th className="px-4 py-2.5 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((u) => (
                            <tr key={u.id} data-testid={`admin-row-${u.id}`} className="border-b border-border/50 hover:bg-muted/30">
                                <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-2.5">
                                        <Avatar className="h-7 w-7 border border-border">
                                            {u.profile_picture && <AvatarImage src={`${BACKEND_URL}${u.profile_picture}`} />}
                                            <AvatarFallback className="text-[10px] font-mono bg-muted">{u.full_name.split(" ").map(s => s[0]).slice(0,2).join("")}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className="text-sm font-medium">{u.full_name}</div>
                                            <div className="font-mono text-[10px] text-muted-foreground">{u.mobile}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-2.5 font-mono text-xs">{u.employee_id}</td>
                                <td className="px-4 py-2.5 text-xs">{u.department}</td>
                                <td className="px-4 py-2.5">{STATUS_BADGE[u.status]}</td>
                                <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{u.last_seen ? dayjs(u.last_seen).format("DD/MM HH:mm") : "—"}</td>
                                <td className="px-4 py-2.5 text-right">
                                    <div className="flex justify-end gap-1.5">
                                        {showActions.includes("approve") && u.status !== "approved" && (
                                            <Button data-testid={`approve-${u.id}`} size="sm" variant="outline" disabled={actionId === u.id + "approve"} onClick={() => act(u.id, "approve")}>
                                                {actionId === u.id + "approve" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Approve"}
                                            </Button>
                                        )}
                                        {showActions.includes("reject") && u.status === "pending" && (
                                            <Button data-testid={`reject-${u.id}`} size="sm" variant="ghost" disabled={actionId === u.id + "reject"} onClick={() => act(u.id, "reject")}>Reject</Button>
                                        )}
                                        {showActions.includes("suspend") && u.status === "approved" && u.role !== "super_admin" && (
                                            <Button data-testid={`suspend-${u.id}`} size="sm" variant="ghost" disabled={actionId === u.id + "suspend"} onClick={() => act(u.id, "suspend")}>Suspend</Button>
                                        )}
                                        {showActions.includes("reinstate") && u.status === "suspended" && (
                                            <Button data-testid={`reinstate-${u.id}`} size="sm" variant="outline" disabled={actionId === u.id + "reinstate"} onClick={() => act(u.id, "reinstate")}>Reinstate</Button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
