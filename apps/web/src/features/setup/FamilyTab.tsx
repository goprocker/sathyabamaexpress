import { useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2, User } from "lucide-react";
import { FAMILY_RELATIONS, FamilyMemberInputSchema, type FamilyRelation } from "@household/contracts";
import { Button, StatusPill } from "@/components/ui/primitives";
import { useSetupAction } from "@/hooks/profile";
import * as api from "@/lib/profileApi";
import type { ProfileView } from "@/lib/profileApi";
import { FormButtons, FormCard, Notice, SelectField, TextField, errorMessage, grid2, num, validate } from "./kit";

type Person = ProfileView["family"][number];

const RELATION_LABELS: Record<FamilyRelation, string> = {
  self: "Me",
  spouse: "Spouse or partner",
  child: "Child",
  parent: "Parent",
  sibling: "Sibling",
  grandparent: "Grandparent",
  other: "Other",
};

const relationOptions = (includeSelf: boolean) =>
  FAMILY_RELATIONS.filter((r) => includeSelf || r !== "self").map((value) => ({ value, label: RELATION_LABELS[value] }));

function PersonForm({ person, isSelf, onDone }: { person?: Person | undefined; isSelf?: boolean; onDone: () => void }) {
  // The account starts out named "You"; ask for the real name rather than pre-filling that.
  const [name, setName] = useState(person && person.name !== "You" ? person.name : "");
  const [age, setAge] = useState(person?.age !== undefined ? String(person.age) : "");
  const [relation, setRelation] = useState<FamilyRelation>((person?.relation as FamilyRelation | undefined) ?? (isSelf ? "self" : "child"));
  const [diet, setDiet] = useState(person?.dietaryPreferences?.join(", ") ?? "");
  const [phone, setPhone] = useState(person?.phoneE164 ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  const save = useSetupAction(async (input: Parameters<typeof api.addFamily>[0]) => {
    if (isSelf) return api.updateMe(input);
    if (person) return api.updateFamily(person.id, input);
    return api.addFamily(input, api.newKey());
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFailure(null);
    const parsed = validate(FamilyMemberInputSchema, {
      name,
      age: num(age),
      relation,
      dietaryPreferences: diet.split(",").map((d) => d.trim()).filter(Boolean),
      phone,
    });
    if (!parsed.ok) return setErrors(parsed.errors);
    setErrors({});
    save.mutate(parsed.data, { onSuccess: onDone, onError: (err) => setFailure(errorMessage(err)) });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className={grid2}>
        <TextField label={isSelf ? "Your name" : "Name"} value={name} onChange={setName} error={errors.name} autoComplete={isSelf ? "name" : "off"} />
        <TextField label="Age" value={age} onChange={setAge} error={errors.age} type="number" inputMode="numeric" min={0} max={120} />
      </div>
      {!isSelf && <SelectField label="Relation" value={relation} onChange={setRelation} options={relationOptions(false)} error={errors.relation} />}
      <div className={grid2}>
        <TextField label="Food preferences" value={diet} onChange={setDiet} hint="For example: vegetarian, no onion. Separate with commas." />
        <TextField label="Mobile number (optional)" value={phone} onChange={setPhone} type="tel" inputMode="tel" error={errors.phone} />
      </div>
      {failure && <Notice tone="error">{failure}</Notice>}
      <FormButtons busy={save.isPending} submitLabel={person || isSelf ? "Save" : "Add person"} onCancel={onDone} />
    </form>
  );
}

function PersonRow({ person, onEdit }: { person: Person; onEdit: () => void }) {
  const [failure, setFailure] = useState<string | null>(null);
  const remove = useSetupAction(api.removeFamily);
  const isSelf = person.relation === "self";
  const details = [person.age !== undefined ? `${person.age} years` : null, RELATION_LABELS[(person.relation as FamilyRelation) ?? "other"], person.dietaryPreferences?.join(", ")]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="card-base p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent">
          <User size={18} strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-[16px] font-medium">
            {person.name === "You" ? "You" : person.name}
            {isSelf && <StatusPill tone="accent">You</StatusPill>}
          </p>
          <p className="truncate text-[13px] text-text-secondary">{details || "Add age and food preferences"}</p>
        </div>
        <button type="button" onClick={onEdit} aria-label={`Edit ${person.name}`} className="flex size-11 items-center justify-center rounded-full hover:bg-surface-elevated">
          <Pencil size={16} strokeWidth={1.6} />
        </button>
        {!isSelf && (
          <button
            type="button"
            aria-label={`Remove ${person.name}`}
            disabled={remove.isPending}
            onClick={() => remove.mutate(person.id, { onError: (err) => setFailure(errorMessage(err)) })}
            className="flex size-11 items-center justify-center rounded-full text-danger hover:bg-danger-subtle disabled:opacity-50"
          >
            <Trash2 size={16} strokeWidth={1.6} />
          </button>
        )}
      </div>
      {failure && (
        <div className="mt-3">
          <Notice tone="error">{failure}</Notice>
        </div>
      )}
    </li>
  );
}

export function FamilyTab({ profile }: { profile: ProfileView }) {
  const me = profile.family.find((m) => m.relation === "self") ?? profile.family[0];
  const [editing, setEditing] = useState<string | "new" | null>(me?.age === undefined ? (me?.id ?? null) : null);

  return (
    <div className="space-y-5">
      <p className="text-[15px] text-text-secondary">
        Tell us who lives at home. Ages and food preferences help with meal plans, and you can add phone numbers for calls and reminders.
      </p>

      <ul className="space-y-3">
        {profile.family.map((person) =>
          editing === person.id ? (
            <li key={person.id}>
              <FormCard title={person.relation === "self" ? "About you" : `Edit ${person.name}`} onClose={() => setEditing(null)}>
                <PersonForm person={person} isSelf={person.relation === "self"} onDone={() => setEditing(null)} />
              </FormCard>
            </li>
          ) : (
            <PersonRow key={person.id} person={person} onEdit={() => setEditing(person.id)} />
          ),
        )}
      </ul>

      {editing === "new" ? (
        <FormCard title="Add a family member" onClose={() => setEditing(null)}>
          <PersonForm onDone={() => setEditing(null)} />
        </FormCard>
      ) : (
        <Button variant="secondary" onClick={() => setEditing("new")} className="w-full sm:w-auto">
          <Plus size={16} strokeWidth={1.75} />
          Add a family member
        </Button>
      )}
    </div>
  );
}
