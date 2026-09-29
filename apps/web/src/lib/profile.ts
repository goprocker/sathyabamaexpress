import { useMembers } from "@/hooks/life";
import { useStoredState } from "@/lib/storage";

/** Active household profile. The member list comes from the API; the selection is a per-device choice. */
export function useActiveProfile() {
  const { data } = useMembers();
  const members = data ?? [];
  const [id, setId] = useStoredState<string>("livora.profile", "");
  const active = members.find((m) => m.id === id) ?? members[0];
  return { active, members, setActive: setId };
}
