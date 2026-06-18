import { Check, CheckCheck } from "lucide-react";
import dayjs from "dayjs";
import { BACKEND_URL } from "@/lib/apiClient";

function TickIcon({ status }) {
    if (status === "read") return <CheckCheck className="h-3.5 w-3.5" style={{ color: "hsl(var(--tick-read))" }} />;
    if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5" style={{ color: "hsl(var(--tick-sent))" }} />;
    return <Check className="h-3.5 w-3.5" style={{ color: "hsl(var(--tick-sent))" }} />;
}

function AttachmentPreview({ attachment }) {
    if (!attachment) return null;
    const url = `${BACKEND_URL}${attachment.url}`;
    const isImage = attachment.mime?.startsWith("image/");
    if (isImage) {
        return (
            <a href={url} target="_blank" rel="noreferrer" className="block">
                <img src={url} alt={attachment.name} className="max-w-[260px] max-h-[260px] rounded-sm border border-border/40 object-cover" />
            </a>
        );
    }
    return (
        <a href={url} target="_blank" rel="noreferrer" data-testid="message-attachment-link"
           className="flex items-center gap-3 p-2.5 bg-background/40 border border-border rounded-sm max-w-[280px] hover:bg-background/70 transition-colors">
            <div className="h-9 w-9 rounded-sm bg-accent/15 flex items-center justify-center font-mono text-[10px] uppercase text-accent shrink-0">
                {(attachment.name || "FILE").split(".").pop().slice(0, 4)}
            </div>
            <div className="min-w-0">
                <div className="text-xs font-medium truncate">{attachment.name}</div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {(attachment.size / 1024).toFixed(1)} KB
                </div>
            </div>
        </a>
    );
}

export default function MessageBubble({ message, isOwn }) {
    const time = dayjs(message.created_at).format("HH:mm");
    return (
        <div className={`flex ${isOwn ? "justify-end" : "justify-start"} animate-fade-in`} data-testid={`msg-${message.id}`}>
            <div className={`max-w-[78%] md:max-w-[65%] px-3 py-2 rounded-md border ${
                isOwn
                    ? "bg-bubble-sent border-accent/30 text-foreground rounded-br-sm"
                    : "bg-bubble-received border-border rounded-bl-sm"
            }`}>
                {message.attachment && <div className="mb-1.5"><AttachmentPreview attachment={message.attachment} /></div>}
                {message.text && <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.text}</div>}
                <div className={`flex items-center gap-1.5 mt-1 ${isOwn ? "justify-end" : "justify-start"}`}>
                    <span className="font-mono text-[10px] text-muted-foreground">{time}</span>
                    {isOwn && <TickIcon status={message.status} />}
                </div>
            </div>
        </div>
    );
}
