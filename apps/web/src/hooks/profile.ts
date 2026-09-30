import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateAllHouseholdQueries } from "@/hooks/queries";
import * as api from "@/lib/profileApi";

export const profileKey = ["profile"] as const;

export const useProfile = (options: { enabled?: boolean } = {}) =>
  useQuery({ queryKey: profileKey, queryFn: api.getProfile, enabled: options.enabled ?? true });

/**
 * Any change to the profile can move reminders, obligations, the timeline and
 * what the assistant knows, so refresh those too, not just the Setup screen.
 */
export function useSetupAction<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: profileKey });
      invalidateAllHouseholdQueries(qc);
    },
  });
}
