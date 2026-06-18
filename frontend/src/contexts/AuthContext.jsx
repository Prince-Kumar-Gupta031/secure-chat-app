import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/apiClient";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchMe = useCallback(async () => {
        const token = localStorage.getItem("drdo_token");
        if (!token) { setLoading(false); return; }
        try {
            const { data } = await api.get("/auth/me");
            setUser(data);
        } catch {
            localStorage.removeItem("drdo_token");
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchMe(); }, [fetchMe]);

    const login = async (mobile, password) => {
        const { data } = await api.post("/auth/login", { mobile, password });
        localStorage.setItem("drdo_token", data.token);
        setUser(data.user);
        return data.user;
    };

    const logout = () => {
        localStorage.removeItem("drdo_token");
        setUser(null);
        window.location.href = "/login";
    };

    const refresh = fetchMe;

    return (
        <AuthCtx.Provider value={{ user, loading, login, logout, refresh, setUser }}>
            {children}
        </AuthCtx.Provider>
    );
}

export const useAuth = () => useContext(AuthCtx);
