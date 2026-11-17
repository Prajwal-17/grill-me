import { FileText } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";

/** Secondary reference material stays outside the question's reading flow. */
export function QuizPrompt({ prompt }: { prompt: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-muted">
          <FileText size={14} aria-hidden="true" />
          View prompt
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-xl">
        <DialogTitle>Original prompt</DialogTitle>
        <div className="min-h-0 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words text-reading">
          {prompt}
        </div>
      </DialogContent>
    </Dialog>
  );
}
