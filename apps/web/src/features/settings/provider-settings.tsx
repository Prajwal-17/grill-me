import { useState } from "react";
import { Plus } from "lucide-react";
import type {
  LocalSettings,
  ModelSelection,
  SavedProvider,
} from "@repo/backend/shared/contracts";
import { Button } from "@/shared/components/ui/button";
import { SearchSelect } from "@/shared/components/ui/search-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  SettingsFeedback,
  SettingsHeading,
  SettingsRow,
} from "./settings-layout";
import { ConnectionForm } from "./connection-form";
import { ConnectionRow } from "./connection-row";
import { effortLabels, presetNames } from "./provider-options";
import { useModelCatalog } from "@/shared/components/ai/use-composer-model";
import { useSettingsMutation } from "./use-settings-mutation";

/** Saved model + effort used when an AI action starts without a user pick. */
function DefaultModelRow({ busy }: { busy: boolean }) {
  const catalog = useModelCatalog();
  const change = useSettingsMutation();
  const connections = catalog.data?.connections ?? [];
  const saved = catalog.data?.defaultSelection ?? null;
  const savedConnection = saved
    ? connections.find((connection) => connection.id === saved.providerId)
    : undefined;
  const savedModel = savedConnection?.models.find(
    (model) => model.id === saved?.model,
  );
  const efforts =
    savedModel?.capabilities?.reasoningEfforts ??
    savedModel?.reasoningEfforts ??
    [];
  const options = [
    {
      id: "auto",
      label: "Automatic",
      description: "Use the active connection's saved model",
    },
    ...connections.flatMap((connection) =>
      connection.models.map((model) => ({
        id: `${connection.id}:${model.id}`,
        label: model.name,
        description:
          model.id === model.name
            ? connection.name
            : `${connection.name} · ${model.id}`,
      })),
    ),
  ];
  const optionFor = (id: string) =>
    connections
      .flatMap((connection) =>
        connection.models.map((model) => ({
          connection,
          model,
          key: `${connection.id}:${model.id}`,
        })),
      )
      .find((entry) => entry.key === id);
  const save = (selection: ModelSelection | null) =>
    change.mutate({
      path: "/settings/default-selection",
      body: { selection },
    });
  const pick = (id: string) => {
    if (id === "auto") {
      save(null);
      return;
    }
    const entry = optionFor(id);
    if (entry) {
      const efforts =
        entry.model.capabilities?.reasoningEfforts ??
        entry.model.reasoningEfforts ??
        [];
      save({
        providerId: entry.connection.id,
        model: entry.model.id,
        reasoningEffort:
          saved?.reasoningEffort !== undefined &&
          saved.reasoningEffort !== null &&
          efforts.includes(saved.reasoningEffort)
            ? saved.reasoningEffort
            : null,
      });
    }
  };
  const typeCustom = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      save(null);
      return;
    }
    const entry = optionFor(trimmed);
    if (entry) {
      pick(entry.key);
      return;
    }
    const providerId =
      savedConnection?.id ??
      connections.find(
        (connection) => connection.id === catalog.data?.activeConnectionId,
      )?.id ??
      connections[0]?.id;
    if (!providerId) return;
    save({ providerId, model: trimmed, reasoningEffort: null });
  };
  const pickerValue = saved ? `${saved.providerId}:${saved.model}` : "auto";
  return (
    <>
      <SettingsRow label="Default model" htmlFor="default-model">
        {connections.length ? (
          <div className="space-y-2">
            <SearchSelect
              id="default-model"
              label="Default model"
              editable
              value={pickerValue}
              onChange={typeCustom}
              placeholder="connection:model-id"
              searchPlaceholder="Search models…"
              emptyMessage="No matching models. The typed ID is kept."
              disabled={busy || catalog.isPending}
              options={options}
            />
            <p className="text-metadata text-muted">
              Used when an AI action runs without a chosen model: reviews,
              preparation, and anything that starts on its own.
            </p>
          </div>
        ) : (
          <p className="text-metadata text-muted">
            {catalog.isPending
              ? "Loading the model catalog…"
              : "Save an enabled API connection to choose a default model."}
          </p>
        )}
      </SettingsRow>
      <SettingsRow label="Default effort" htmlFor="default-effort">
        <Select
          value={saved?.reasoningEffort ?? ""}
          onValueChange={(value) =>
            saved &&
            save({
              ...saved,
              reasoningEffort: value
                ? (value as ModelSelection["reasoningEffort"])
                : null,
            })
          }
          disabled={busy || !saved || efforts.length === 0}
        >
          <SelectTrigger
            id="default-effort"
            aria-label="Default reasoning effort"
            className="w-full bg-surface shadow-none"
          >
            <SelectValue placeholder="Not set" />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={5}>
            {efforts.map((effort) => (
              <SelectItem key={effort} value={effort}>
                {effortLabels[effort] ?? effort}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
    </>
  );
}

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
      <DefaultModelRow busy={change.isPending} />
      <SettingsFeedback error={change.error} />
      {!api.length && (
        <p className="mt-4 text-supporting text-muted">
          Add an API connection to generate challenges and quizzes, prepare
          codebases, and review your work. CLI integrations are inactive.
        </p>
      )}
      <div className="mt-4 overflow-hidden rounded-lg bg-surface">
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
        <p className="mt-5 border-t border-line pt-3 text-supporting text-muted">
          {legacy.length} legacy CLI{" "}
          {legacy.length === 1 ? "connection is" : "connections are"} preserved
          but inactive. Their settings and credentials are not changed.
        </p>
      )}
    </>
  );
}
