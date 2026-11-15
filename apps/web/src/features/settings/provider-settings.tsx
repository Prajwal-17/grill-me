import { useState } from "react";
import { Plus } from "lucide-react";
import type {
  LocalSettings,
  SavedProvider,
} from "@repo/backend/shared/contracts";
import { Button } from "@/shared/components/ui/button";
import { SearchSelect } from "@/shared/components/ui/search-select";
import {
  SettingsFeedback,
  SettingsHeading,
  SettingsRow,
} from "./settings-layout";
import { ConnectionForm } from "./connection-form";
import { ConnectionRow } from "./connection-row";
import { presetNames } from "./provider-options";
import { useSettingsMutation } from "./use-settings-mutation";

export function ProviderSettings({ data }: { data: LocalSettings }) {
  const change = useSettingsMutation();
  const [editing, setEditing] = useState<SavedProvider | "new" | null>(null);
  const api = data.providers.filter((provider) => provider.kind === "openai");
  const legacy = data.providers.filter(
    (provider) => provider.kind !== "openai",
  );
  const enabled = api.filter((provider) => provider.enabled);
  const activeId = enabled.some(
    (provider) => provider.id === data.activeProviderId,
  )
    ? data.activeProviderId!
    : "none";
  return (
    <>
      <SettingsHeading title="API connections" />
      <SettingsRow label="Use for AI requests" htmlFor="active-provider">
        <SearchSelect
          id="active-provider"
          label="Use for AI requests"
          value={activeId}
          disabled={change.isPending}
          onChange={(id) =>
            change.mutate({
              path: "/settings/active-provider",
              body: { id: id === "none" ? null : id },
            })
          }
          placeholder="None"
          searchPlaceholder="Search connections…"
          emptyMessage="No matching API connections."
          options={[
            {
              id: "none",
              label: "None",
              description: "No API connection selected",
            },
            ...enabled.map((provider) => ({
              id: provider.id,
              label: provider.name,
              description: presetNames[provider.preset],
            })),
          ]}
        />
      </SettingsRow>
      <SettingsFeedback error={change.error} />
      {!api.length && (
        <p className="mt-4 text-supporting text-muted">
          Add an API connection to generate challenges, quizzes, hints, and
          discussions. CLI integrations are inactive.
        </p>
      )}
      <div className="mt-6 overflow-hidden rounded-lg bg-surface">
        <div className="divide-y divide-line">
          {api.map((provider) => (
            <ConnectionRow
              key={provider.id}
              provider={provider}
              active={data.activeProviderId === provider.id}
              busy={change.isPending}
              onEdit={() => setEditing(provider)}
              onToggle={(value) =>
                change.mutate({
                  path: `/settings/providers/${provider.id}/enabled`,
                  body: { enabled: value },
                })
              }
              onDelete={() =>
                change.mutate({
                  path: `/settings/providers/${provider.id}`,
                  method: "DELETE",
                })
              }
            />
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={change.isPending}
          onClick={() => setEditing("new")}
          variant="secondary"
        >
          <Plus size={14} />
          Add API connection
        </Button>
      </div>
      {editing && (
        <ConnectionForm
          key={editing === "new" ? "new" : editing.id}
          provider={editing === "new" ? null : editing}
          data={data}
          onDone={() => setEditing(null)}
          onSaved={(saved) => setEditing(saved)}
        />
      )}
      {legacy.length > 0 && (
        <p className="mt-8 border-t border-line pt-4 text-supporting text-muted">
          {legacy.length} legacy CLI{" "}
          {legacy.length === 1 ? "connection is" : "connections are"} preserved
          but inactive. Their settings and credentials are not changed.
        </p>
      )}
    </>
  );
}
