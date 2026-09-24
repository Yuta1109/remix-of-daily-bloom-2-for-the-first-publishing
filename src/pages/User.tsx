import { useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Cloud,
  Coins,
  Crown,
  LogIn,
  LogOut,
  RefreshCw,
  Settings as SettingsIcon,
  ShoppingBag,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/firebase/AuthProvider";
import { useCloudSync } from "@/lib/firebase/SyncProvider";
import { syncStatusI18nKey, type CloudSyncStatus } from "@/lib/firebase/sync-status";
import { useI18n, type TranslationKeys } from "@/lib/i18n";
import { getPointBalance } from "@/lib/v3/repository";

interface RowProps {
  icon: LucideIcon;
  label: string;
  value?: string;
  disabled?: boolean;
  onClick?: () => void;
  testId?: string;
}

function Row({ icon: Icon, label, value, disabled, onClick, testId }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      data-testid={testId}
      aria-disabled={disabled || !onClick || undefined}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left disabled:opacity-50"
    >
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
      <span className="text-base flex-1">{label}</span>
      {value !== undefined && (
        <span className="text-sm text-muted-foreground tabular-nums">{value}</span>
      )}
      {onClick && !disabled && (
        <ChevronRight className="w-4 h-4 text-muted-foreground/60 shrink-0" aria-hidden="true" />
      )}
    </button>
  );
}

function SectionLabel({ labelKey }: { labelKey: TranslationKeys }) {
  const { t } = useI18n();
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
      {t(labelKey)}
    </h2>
  );
}

function authStatusLabel(
  status: ReturnType<typeof useAuth>["status"],
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (status === "signing_in") return t("userAuthSigningIn");
  if (status === "signed_in") return t("userAuthSignedIn");
  if (status === "error") return t("userAuthError");
  return t("userAuthSignedOut");
}

function syncStatusLabel(
  status: CloudSyncStatus,
  t: ReturnType<typeof useI18n>["t"],
): string {
  return t(syncStatusI18nKey(status));
}

function formatSyncedAt(
  iso: string | null,
  locale: string,
  neverLabel: string,
): string {
  if (!iso) return neverLabel;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return neverLabel;
  return date.toLocaleString(locale === "ja" ? "ja-JP" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function User() {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const { status, user, configPresent, signInWithGoogle, signOut } = useAuth();
  const { sync, syncNow } = useCloudSync();
  const pointBalance = useMemo(() => getPointBalance(), []);
  const signedIn = status === "signed_in" && !!user;
  const displayName = user?.displayName || user?.email || t("userAccountFallbackName");

  return (
    <div className="app-shell-page">
      <div className="app-shell-header px-2 pb-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label={t("back")}
            className="p-2 rounded-full text-foreground/70 hover:bg-secondary/70 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>
          <h1 className="text-xl font-bold tracking-tight">{t("userPageTitle")}</h1>
        </div>
      </div>

      <div className="app-shell-scroll px-4">
        <section className="mb-5">
          <SectionLabel labelKey="userSectionAccount" />
          <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/60">
            {signedIn ? (
              <div className="flex items-center gap-3 px-4 py-3.5">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <CircleUserRound className="w-10 h-10 text-muted-foreground shrink-0" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-base truncate">{displayName}</p>
                  {user.email && user.displayName ? (
                    <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                  ) : null}
                  <p data-testid="user-auth-status" className="text-xs text-muted-foreground mt-0.5">
                    {authStatusLabel(status, t)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="px-4 py-3.5 space-y-2">
                <p data-testid="user-auth-status" className="text-sm">
                  {authStatusLabel(status, t)}
                </p>
                <p className="text-sm text-muted-foreground">{t("userGoogleCloudHint")}</p>
                {!configPresent && (
                  <p data-testid="user-auth-config-missing" className="text-sm text-muted-foreground">
                    {t("userFirebaseConfigMissing")}
                  </p>
                )}
                {status === "error" && (
                  <p data-testid="user-auth-error" className="text-sm text-destructive">
                    {t("userAuthError")}
                  </p>
                )}
              </div>
            )}
            {!signedIn && (
              <Row
                icon={LogIn}
                label={t("userGoogleSignIn")}
                disabled={status === "signing_in" || !configPresent}
                onClick={() => void signInWithGoogle()}
                testId="user-google-sign-in"
              />
            )}
            {signedIn && (
              <Row
                icon={LogOut}
                label={t("userGoogleSignOut")}
                onClick={() => void signOut()}
                testId="user-google-sign-out"
              />
            )}
          </div>
          {signedIn && (
            <p className="text-xs text-muted-foreground mt-2 px-1">{t("userSignOutKeepsLocal")}</p>
          )}
          {signedIn && import.meta.env.DEV && (
            <details className="mt-2 px-1">
              <summary className="text-xs text-muted-foreground cursor-pointer">
                {t("userAuthAdvanced")}
              </summary>
              <p className="text-xs text-muted-foreground break-all mt-1">
                {t("userAuthUidLabel")}: <span data-testid="user-auth-uid">{user.uid}</span>
              </p>
            </details>
          )}
        </section>

        <section className="mb-5">
          <SectionLabel labelKey="userSectionCloud" />
          <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/60">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <Cloud className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
              <span className="text-base flex-1">{t("userCloudStatusRow")}</span>
              <span data-testid="user-sync-status" className="text-sm text-muted-foreground">
                {syncStatusLabel(sync.status, t)}
              </span>
            </div>
            {signedIn && sync.status === "synced" && (
              <div className="px-4 py-3 text-sm text-muted-foreground">{t("userCloudSaved")}</div>
            )}
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="text-base flex-1">{t("userLastSynced")}</span>
              <span data-testid="user-last-synced" className="text-sm text-muted-foreground">
                {formatSyncedAt(sync.lastSyncedAt, locale, t("userLastSyncedNever"))}
              </span>
            </div>
            {signedIn && sync.status === "error" && (
              <div className="px-4 py-3 text-sm text-destructive">{t("userSyncErrorGeneric")}</div>
            )}
            {signedIn && (
              <Row
                icon={RefreshCw}
                label={sync.status === "error" ? t("userSyncRetry") : t("userSyncNow")}
                disabled={sync.status === "syncing"}
                onClick={() => void syncNow()}
                testId="user-sync-now"
              />
            )}
          </div>
        </section>

        <section className="mb-5">
          <SectionLabel labelKey="userSectionProgress" />
          <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/60">
            <Row icon={Coins} label={t("userPointsRow")} value={String(pointBalance)} />
            <Row icon={Trophy} label={t("userAchievementsRow")} value={t("comingSoon")} disabled />
          </div>
        </section>

        <section className="mb-6">
          <SectionLabel labelKey="userSectionApp" />
          <div className="bg-card rounded-2xl shadow-soft divide-y divide-border/60">
            <Row
              icon={SettingsIcon}
              label={t("userSettingsRow")}
              onClick={() => navigate("/settings")}
            />
            <Row icon={ShoppingBag} label={t("userStoreRow")} value={t("comingSoon")} disabled />
            <Row
              icon={Crown}
              label={t("userSubscriptionRow")}
              value={t("comingSoon")}
              disabled
            />
          </div>
        </section>
      </div>
    </div>
  );
}
