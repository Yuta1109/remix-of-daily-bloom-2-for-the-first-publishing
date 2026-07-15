import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";

// TODO: Replace with your actual contact email address before publishing.
const CONTACT_EMAIL = "your-email@example.com";
const LAST_UPDATED = "2026-07-15";

export default function Privacy() {
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const ja = locale === "ja";

  return (
    <div className="max-w-lg mx-auto px-5 pt-6 pb-32 min-h-screen">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("back")}
      </button>

      <article className="prose prose-sm max-w-none space-y-4 animate-fade-in-up">
        <h1 className="text-2xl font-bold tracking-tight">{t("privacyPolicy")}</h1>
        <p className="text-xs text-muted-foreground">
          {ja ? "最終更新日" : "Last updated"}: {LAST_UPDATED}
        </p>

        {ja ? (
          <div className="space-y-4 text-sm leading-relaxed text-foreground/90">
            <p>
              Essences（以下「本アプリ」）は、ユーザーのプライバシーを尊重します。本ポリシーは、本アプリが扱う情報について説明します。
            </p>
            <section className="space-y-1">
              <h2 className="text-base font-semibold">収集する情報</h2>
              <p>
                本アプリは、アカウント登録を必要とせず、個人情報をサーバーに送信しません。予定・タスク・設定などのデータは、すべてお使いの端末内にのみ保存されます。
              </p>
            </section>
            <section className="space-y-1">
              <h2 className="text-base font-semibold">通知とライブアクティビティ</h2>
              <p>
                通知およびロック画面のライブアクティビティは、端末上で予定情報をもとに生成されます。これらの情報が外部に送信されることはありません。通知は端末の設定でいつでも無効にできます。
              </p>
            </section>
            <section className="space-y-1">
              <h2 className="text-base font-semibold">第三者への提供</h2>
              <p>
                本アプリは、ユーザーのデータを第三者に販売・共有・送信しません。解析ツールや広告 SDK も使用していません。
              </p>
            </section>
            <section className="space-y-1">
              <h2 className="text-base font-semibold">データの削除</h2>
              <p>
                本アプリを削除すると、端末内に保存されたすべてのデータも削除されます。
              </p>
            </section>
            <section className="space-y-1">
              <h2 className="text-base font-semibold">お問い合わせ</h2>
              <p>
                本ポリシーに関するご質問は {CONTACT_EMAIL} までご連絡ください。
              </p>
            </section>
          </div>
        ) : (
          <div className="space-y-4 text-sm leading-relaxed text-foreground/90">
            <p>
              Essences ("the app") respects your privacy. This policy explains
              what information the app handles.
            </p>
            <section className="space-y-1">
              <h2 className="text-base font-semibold">Information we collect</h2>
              <p>
                The app requires no account and sends no personal information to
                any server. All data — events, tasks, and settings — is stored
                only on your device.
              </p>
            </section>
            <section className="space-y-1">
              <h2 className="text-base font-semibold">Notifications &amp; Live Activities</h2>
              <p>
                Notifications and Lock Screen Live Activities are generated
                on-device from your event data. This information is never
                transmitted off your device. You can disable notifications at any
                time in your device settings.
              </p>
            </section>
            <section className="space-y-1">
              <h2 className="text-base font-semibold">Third parties</h2>
              <p>
                The app does not sell, share, or transmit your data to third
                parties. It contains no analytics or advertising SDKs.
              </p>
            </section>
            <section className="space-y-1">
              <h2 className="text-base font-semibold">Deleting your data</h2>
              <p>
                Deleting the app removes all data stored on your device.
              </p>
            </section>
            <section className="space-y-1">
              <h2 className="text-base font-semibold">Contact</h2>
              <p>
                For questions about this policy, contact {CONTACT_EMAIL}.
              </p>
            </section>
          </div>
        )}
      </article>
    </div>
  );
}
