import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SocketProvider } from "@/contexts/SocketContext";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Landing from "@/pages/Landing";
import ChatPage from "@/pages/ChatPage";
import DirectoryPage from "@/pages/DirectoryPage";
import ProfilePage from "@/pages/ProfilePage";
import AdminPage from "@/pages/AdminPage";
import AppLayout from "@/components/layout/AppLayout";
import "@/App.css";

function Protected({ children, adminOnly = false }) {
    const { user, loading } = useAuth();
    if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground font-mono text-sm">AUTHENTICATING…</div>;
    if (!user) return <Navigate to="/login" replace />;
    if (adminOnly && !["admin", "super_admin"].includes(user.role)) return <Navigate to="/chat" replace />;
    return children;
}

function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <SocketProvider>
                    <BrowserRouter>
                        <Routes>
                            <Route path="/" element={<Landing />} />
                            <Route path="/login" element={<Login />} />
                            <Route path="/register" element={<Register />} />
                            <Route element={<Protected><AppLayout /></Protected>}>
                                <Route path="/chat" element={<ChatPage />} />
                                <Route path="/chat/:chatId" element={<ChatPage />} />
                                <Route path="/directory" element={<DirectoryPage />} />
                                <Route path="/profile" element={<ProfilePage />} />
                                <Route path="/admin" element={<Protected adminOnly><AdminPage /></Protected>} />
                            </Route>
                            <Route path="*" element={<Navigate to="/chat" replace />} />
                        </Routes>
                        <Toaster richColors position="top-right" />
                    </BrowserRouter>
                </SocketProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}

export default App;
