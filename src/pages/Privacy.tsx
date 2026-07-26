import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { SwipeBackPage } from "@/components/SwipeBackPage";
import Settings from "@/pages/Settings";

const CONTACT_EMAIL = "essences.app.support@gmail.com";
const LAST_UPDATED = "2026-07-26";

export default function Privacy() {
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const ja = locale === "ja";

  return (
    <SwipeBackPage
      underlay={<Settings staticPreview />}
      onBack={() => navigate("/settings")}
      className="px-5"
    >
      <button
        onClick={() => navigate("/settings")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("back")}
      </button>

      <article className="prose prose-sm max-w-none space-y-4 animate-fade-in-up pb-8">
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
                本アプリは、名前・メールアドレス・電話番号などの登録を求めません。予定・タスク・設定などの本文データは、原則としてお使いの端末内にのみ保存されます。
              </p>
              <p>
                ロック画面のライブアクティビティを端末再起動後などでも継続表示するために、Google Firebase（匿名認証・Cloud Firestore・Cloud Functions・Firebase Cloud Messaging）を利用します。その過程で、次のような技術情報がサーバーへ送信されることがあります。
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>匿名のユーザー識別子（ログイン画面はありません）</li>
                <li>プッシュ通知用のデバイストークン</li>
                <li>ライブアクティビティ更新用のトークン</li>
                <li>ライブアクティビティの開始・更新・終了に必要な予定の時刻情報</li>
              </ul>
              <p>
                予定の詳細なメモやタスク本文など、表示に不要な内容は送信しません。広告・解析用のサードパーティ SDK は使用していません。
              </p>
            </section>
            <section className="space-y-1">
              <h2 className="text-base font-semibold">通知とライブアクティビティ</h2>
              <p>
                本アプリは、端末上の通知と、Apple の ActivityKit によるライブアクティビティを利用します。ライブアクティビティの継続表示のため、上記の技術情報が Firebase 経由で処理される場合があります。通知やライブアクティビティは、端末の設定からいつでも制限できます。
              </p>
            </section>
            <section className="space-y-1">
              <h2 className="text-base font-semibold">第三者への提供</h2>
              <p>
                本アプリは、ユーザーのデータを第三者に販売しません。サービス提供のために Google Firebase を利用しますが、広告配信やマーケティング解析のための共有は行いません。
              </p>
            </section>
            <section className="space-y-1">
              <h2 className="text-base font-semibold">データの削除</h2>
              <p>
                本アプリを端末から削除すると、端末内に保存されたデータは削除されます。サーバー上に残る技術情報の削除をご希望の場合は、下記のお問い合わせ先までご連絡ください。
              </p>
            </section>
            <section className="space-y-1">
              <h2 className="text-base font-semibold">お問い合わせ</h2>
              <p>
                本ポリシーに関するご質問は{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="underline underline-offset-2"
                >
                  {CONTACT_EMAIL}
                </a>{" "}
                までご連絡ください。
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
                The app does not ask you to register a name, email address, or
                phone number. Event, task, and settings content is stored on
                your device by default.
              </p>
              <p>
                To keep Lock Screen Live Activities available after events such
                as a device restart, the app uses Google Firebase (Anonymous
                Authentication, Cloud Firestore, Cloud Functions, and Firebase
                Cloud Messaging). In that process, the following technical data
                may be sent to our servers:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>An anonymous user identifier (there is no sign-in screen)</li>
                <li>A device push token</li>
                <li>A Live Activity update token</li>
                <li>
                  Schedule timing needed to start, update, or end a Live Activity
                </li>
              </ul>
              <p>
                We do not send unnecessary event notes or task body text. The app
                does not include advertising or analytics SDKs.
              </p>
            </section>
            <section className="space-y-1">
              <h2 className="text-base font-semibold">Notifications &amp; Live Activities</h2>
              <p>
                The app uses on-device notifications and Apple ActivityKit Live
                Activities. Technical data described above may be processed via
                Firebase so Live Activities can continue. You can limit
                notifications and Live Activities at any time in your device
                settings.
              </p>
            </section>
            <section className="space-y-1">
              <h2 className="text-base font-semibold">Third parties</h2>
              <p>
                We do not sell your data. We use Google Firebase to operate the
                features above. We do not share data for advertising or marketing
                analytics.
              </p>
            </section>
            <section className="space-y-1">
              <h2 className="text-base font-semibold">Deleting your data</h2>
              <p>
                Deleting the app removes data stored on your device. If you want
                technical data on our servers deleted, contact us below.
              </p>
            </section>
            <section className="space-y-1">
              <h2 className="text-base font-semibold">Contact</h2>
              <p>
                For questions about this policy, contact{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="underline underline-offset-2"
                >
                  {CONTACT_EMAIL}
                </a>
                .
              </p>
            </section>
          </div>
        )}
      </article>
    </SwipeBackPage>
  );
}
