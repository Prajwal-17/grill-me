import { Moon, Sun } from "lucide-react";
import { useAppStore, type Theme } from "@/shared/stores/app-store";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

export function ThemeSelect() {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const Icon = theme === "dark" ? Moon : Sun;
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Appearance: ${theme} theme`}
              className="size-9 text-muted"
            >
              <Icon size={16} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          Appearance · {theme === "dark" ? "Dark" : "Light"}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="bottom" align="end">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as Theme)}
        >
          {[
            { id: "light", label: "Light", icon: Sun },
            { id: "dark", label: "Dark", icon: Moon },
          ].map(({ id, label, icon: ItemIcon }) => (
            <DropdownMenuRadioItem key={id} value={id}>
              <ItemIcon size={14} />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
