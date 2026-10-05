import type { ClaudeSkillStatus } from "@amnis/shared";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchSkillStatus, installSkill } from "../../../api/skill.ts";
import styles from "./SettingsView.module.css";

/**
 * Instala en Claude Code la skill `/amnis-skin` (#160). Es un gesto del
 * usuario: Amnis no escribe en `~/.claude/` sin que lo pida este botón.
 */
export function SkillInstall() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ClaudeSkillStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSkillStatus().then(setStatus, () => setStatus(null));
  }, []);

  async function install() {
    setBusy(true);
    const result = await installSkill();
    setBusy(false);
    if (result.ok) {
      setStatus(result.body);
      setError(null);
    } else {
      setError(result.message);
    }
  }

  if (status === null && error === null) return null;
  const upToDate = status?.installed && status.current;

  return (
    <div className={styles.skillRow}>
      <p className={styles.muted}>
        {t(upToDate ? "settings.skin.skill.done" : "settings.skin.skill.hint")}
      </p>
      {!upToDate && (
        <button
          type="button"
          className={styles.btn}
          disabled={busy}
          onClick={() => void install()}
        >
          {t(
            busy
              ? "settings.skin.skill.installing"
              : status?.installed
                ? "settings.skin.skill.update"
                : "settings.skin.skill.install",
          )}
        </button>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
