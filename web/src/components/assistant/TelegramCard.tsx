import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Popconfirm, Space, Spin, Typography, message } from 'antd';
import { SendOutlined, DisconnectOutlined, LinkOutlined } from '@ant-design/icons';
import {
  getTelegramLink,
  createTelegramLinkCode,
  unlinkTelegram,
  getTelegramBotStatus,
  connectTelegramBot,
  type TelegramLinkStatus,
  type TelegramBotStatus,
} from '../../api/assistant';

// The assistant on Telegram (server: ai/telegram.ts), on the Settings page.
// Everyone: link their Telegram account, so the bot answers as them. The
// admin also sees the bot's status and points Telegram at this server.
// Hidden when the bot is not set up on the server (no TELEGRAM_BOT_TOKEN),
// except for the admin, who is told what is missing.
const when = (iso: string) => new Date(iso).toLocaleString();

export function TelegramCard({ admin = false }: { admin?: boolean }) {
  const [link, setLink] = useState<TelegramLinkStatus | null>(null);
  const [bot, setBot] = useState<TelegramBotStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  const load = useCallback(() => {
    getTelegramLink()
      .then(setLink)
      .catch(() => setLink({ available: false }));
    if (admin) {
      getTelegramBotStatus()
        .then(setBot)
        .catch((err) => message.error(err instanceof Error ? err.message : 'Failed to load the Telegram bot status'));
    }
  }, [admin]);

  useEffect(() => {
    load();
  }, [load]);

  // The link is shown as a real link to tap: phones block a window opened
  // after a request. Opening it, Telegram sends the bot /start <code>.
  const connectMe = async () => {
    setBusy(true);
    try {
      setLinkUrl((await createTelegramLinkCode()).url);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to make a Telegram link');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    try {
      await unlinkTelegram();
      message.success('Telegram unlinked - the bot no longer answers it');
      load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to unlink');
    }
  };

  const connectBot = async () => {
    setBusy(true);
    try {
      const r = await connectTelegramBot();
      message.success(`@${r.botUsername} now sends its messages here`);
      load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to connect the bot');
    } finally {
      setBusy(false);
    }
  };

  const title = <Space><SendOutlined /> Telegram</Space>;
  if (!link || (admin && !bot)) {
    return admin ? (
      <Card title={title}>
        <Spin />
      </Card>
    ) : null;
  }
  if (!admin && !link.available) return null;

  const expectedWebhook = `${window.location.origin}/api/telegram/webhook`;
  const botLink = link.botUsername ?? bot?.botUsername;
  const botName = botLink ? <> - <a href={`https://t.me/${botLink}`} target="_blank" rel="noreferrer">@{botLink}</a></> : null;

  return (
    <Card title={title}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {admin && bot && !bot.configured && (
          <Alert
            type="info"
            showIcon
            message="The bot is not set up yet"
            description="Make a bot with @BotFather in Telegram, put its token in the server's TELEGRAM_BOT_TOKEN, redeploy, then come back here and press Connect the bot."
          />
        )}
        {admin && bot?.configured && (
          <>
            <Typography.Text type="secondary">
              The assistant as a Telegram bot{botName}. Members link by sharing their phone number with the bot (the mobile number on
              their member record), or with a link from this page. A Telegram account that is not linked gets no answers. Same daily
              limits as the app. {bot.linkedAccounts ?? 0} Telegram account{bot.linkedAccounts === 1 ? '' : 's'} linked.
            </Typography.Text>
            {!bot.assistant && <Alert type="warning" showIcon message="The assistant is not set up on this server, so the bot cannot answer" />}
            {bot.webhookUrl === expectedWebhook ? (
              <Typography.Text type="success">Connected - Telegram sends messages to this server.</Typography.Text>
            ) : (
              <Alert
                type="warning"
                showIcon
                message={bot.webhookUrl ? `Telegram sends messages to ${bot.webhookUrl}` : 'Telegram does not send the messages here yet'}
                action={<Button size="small" type="primary" onClick={connectBot} loading={busy}>Connect the bot</Button>}
              />
            )}
            {bot.lastError && (
              <Typography.Text type="secondary">
                Last delivery error ({when(bot.lastError.at)}): {bot.lastError.message}
              </Typography.Text>
            )}
          </>
        )}
        {link.available && (
          <>
            {!admin && (
              <Typography.Text type="secondary">
                Ask the KMCC assistant on Telegram{botName}. Link your Telegram so it answers about your own savings, dues and loan.
                (Or open the bot and share your phone number.)
              </Typography.Text>
            )}
            {(link.links ?? []).map((l) => (
              <div key={l.createdAt} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <Typography.Text>{l.displayName ?? 'Telegram account'}</Typography.Text>
                  <br />
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>linked {when(l.createdAt)}</Typography.Text>
                </div>
                <Popconfirm title="Unlink this Telegram account?" description="The bot will no longer answer it." onConfirm={unlink} okText="Unlink" cancelText="Cancel">
                  <Button danger icon={<DisconnectOutlined />} aria-label="Unlink Telegram" />
                </Popconfirm>
              </div>
            ))}
            {linkUrl ? (
              <Space wrap>
                <Button type="primary" icon={<SendOutlined />} href={linkUrl} target="_blank" rel="noreferrer">
                  Open Telegram
                </Button>
                <Typography.Text type="secondary">then press Start - the link works once, for 10 minutes.</Typography.Text>
                <Button type="link" onClick={() => { setLinkUrl(null); load(); }}>Done</Button>
              </Space>
            ) : (
              <Button icon={<LinkOutlined />} onClick={connectMe} loading={busy} style={{ alignSelf: 'flex-start' }}>
                {(link.links ?? []).length ? 'Link another Telegram account' : 'Link my Telegram'}
              </Button>
            )}
          </>
        )}
      </Space>
    </Card>
  );
}
