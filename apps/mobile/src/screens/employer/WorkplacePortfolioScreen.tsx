/**
 * WorkplacePortfolioScreen — the business owner builds their "Look
 * Inside" tour: photos of the place (with role pins on them), a short
 * workplace video, about, perks, the team and FAQs.
 *
 * Media (photos, video, team photos) saves immediately on upload. Text
 * sections (about, perks, team names, FAQs) save with the Save button.
 * "Preview" opens the exact Look Inside screen seekers see.
 */

import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { spacing, radii } from '@doondo/tokens';
import { Screen, Text, Card, Button, TextField } from '@/components';
import { useTheme } from '@/theme/useTheme';
import { useTranslate } from '@/i18n/useTranslate';
import { useAuth } from '@/hooks/useAuth';
import { haptic } from '@/lib/haptics';
import { resolveMediaUrl } from '@/api/client';
import { jobsApi } from '@/api/jobs.api';
import {
  PHOTO_KINDS,
  portfolioApi,
  type PhotoKind,
  type PortfolioPhoto,
  type WorkplacePortfolio,
} from '@/api/portfolio.api';
import { friendlyErrorMessage } from '@/lib/friendlyError';
import { pickPortfolioPhoto, pickTeamPhoto, pickWorkplaceVideo } from '@/lib/portfolioMedia';
import { useImageSize } from '../seeker/workplace/shared';
import type { AppStackParamList } from '@/navigation/types';
import type { PublicJob } from '@/api/types';

type Nav = NativeStackNavigationProp<AppStackParamList>;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

interface Draft {
  about: string;
  perks: string[];
  team: Array<{ id?: string; key: string; name: string; role: string; tenure: string; photoUrl: string | null }>;
  faqs: Array<{ id?: string; key: string; q: string; a: string }>;
}

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;

function draftFrom(p: WorkplacePortfolio): Draft {
  return {
    about: p.about ?? '',
    perks: [...p.perks],
    team: p.team.map((m) => ({ id: m.id, key: m.id, name: m.name, role: m.role, tenure: m.tenure ?? '', photoUrl: m.photoUrl })),
    faqs: p.faqs.map((f) => ({ id: f.id, key: f.id, q: f.q, a: f.a })),
  };
}

const PERK_SUGGESTIONS = ['perk_meals', 'perk_uniform', 'perk_weekly_pay', 'perk_pf_esi', 'perk_travel', 'perk_staff_room'] as const;
const FAQ_SUGGESTIONS = ['faq_salary_day', 'faq_food', 'faq_experience', 'faq_leave'] as const;

export function WorkplacePortfolioScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const t = useTranslate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const q = useQuery({ queryKey: ['portfolio', 'mine'], queryFn: () => portfolioApi.mine() });
  const jobsQ = useQuery({ queryKey: ['jobs', 'mine', 'active'], queryFn: () => jobsApi.listMine({ status: 'active', limit: 50 }) });
  const server = q.data?.portfolio ?? null;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PortfolioPhoto | null>(null);
  const [perkInput, setPerkInput] = useState('');

  useEffect(() => {
    if (server && !draft) setDraft(draftFrom(server));
  }, [server, draft]);

  const edit = (fn: (d: Draft) => Draft) => {
    setDraft((d) => (d ? fn(d) : d));
    setDirty(true);
  };

  /** Apply a server response without clobbering unsaved text edits. */
  const accept = (p: WorkplacePortfolio) => {
    qc.setQueryData(['portfolio', 'mine'], { portfolio: p });
    void qc.invalidateQueries({ queryKey: ['portfolio', p.employerId] });
    setDraft((d) =>
      d
        ? {
            ...d,
            team: d.team.map((m) => ({ ...m, photoUrl: p.team.find((s) => s.id === m.id)?.photoUrl ?? m.photoUrl })),
          }
        : draftFrom(p),
    );
  };

  const run = async (label: string, fn: () => Promise<{ portfolio: WorkplacePortfolio } | null>) => {
    setBusy(label);
    setError(null);
    try {
      const res = await fn();
      if (res) {
        accept(res.portfolio);
        haptic('success');
      }
    } catch (err) {
      haptic('error');
      setError(friendlyErrorMessage(err, t('portfolio_editor.error_generic')));
    } finally {
      setBusy(null);
    }
  };

  const addPhoto = () => {
    const go = (source: 'library' | 'camera') =>
      run('photo', async () => {
        const img = await pickPortfolioPhoto(source);
        if (!img) return null;
        const kind: PhotoKind = server?.photos.some((p) => p.kind === 'front') ? 'work_area' : 'front';
        return portfolioApi.addPhoto({ dataUrl: img.dataUrl, mimeType: img.mimeType, kind });
      });
    Alert.alert(t('portfolio_editor.add_photo'), undefined, [
      { text: t('portfolio_editor.take_photo'), onPress: () => void go('camera') },
      { text: t('portfolio_editor.choose_photo'), onPress: () => void go('library') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const d = draft!;
      return portfolioApi.update({
        about: d.about.trim() || null,
        perks: d.perks,
        team: d.team.filter((m) => m.name.trim() && m.role.trim()).map((m) => ({ id: m.id, name: m.name.trim(), role: m.role.trim(), tenure: m.tenure.trim() || null })),
        faqs: d.faqs.filter((f) => f.q.trim().length >= 2 && f.a.trim()).map((f) => ({ id: f.id, q: f.q.trim(), a: f.a.trim() })),
      });
    },
    onSuccess: (res) => {
      haptic('success');
      qc.setQueryData(['portfolio', 'mine'], res);
      void qc.invalidateQueries({ queryKey: ['portfolio', res.portfolio.employerId] });
      setDraft(draftFrom(res.portfolio));
      setDirty(false);
      setError(null);
    },
    onError: (err) => setError(friendlyErrorMessage(err, t('portfolio_editor.error_generic'))),
  });

  const photosPatch = (photos: PortfolioPhoto[]) =>
    photos.map((p) => ({ id: p.id, kind: p.kind, caption: p.caption, pins: p.pins.map(({ x, y, jobId, label }) => ({ x, y, jobId, label })) }));

  const jobs = jobsQ.data?.jobs ?? [];
  const { width } = useWindowDimensions();
  // Measured grid width (Card padding varies by theme) → exactly 3 per row.
  const [gridW, setGridW] = useState(0);
  const tile = Math.floor(((gridW || width - spacing.lg * 4) - 16) / 3) - 1;

  if (!draft || !server) {
    return (
      <Screen>
        <Header onBack={() => navigation.goBack()} t={t} />
        <Text tone="secondary" style={{ padding: spacing.lg }}>
          {q.isError ? t('portfolio_editor.error_load') : t('look_inside.loading')}
        </Text>
      </Screen>
    );
  }

  const field = { color: theme.text.primary, borderColor: theme.border.default, backgroundColor: theme.bg.surface } as const;

  return (
    <Screen>
      <Header
        onBack={() => navigation.goBack()}
        onPreview={user ? () => navigation.navigate('LookInside', { employerId: user.id }) : undefined}
        t={t}
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <Text tone="secondary" variant="footnote">{t('portfolio_editor.intro')}</Text>

        {/* Photos */}
        <Card>
          <SectionTitle title={t('portfolio_editor.photos_title')} sub={t('portfolio_editor.photos_sub', { n: server.photos.length, max: 12 })} />
          <View
            onLayout={(e) => setGridW(e.nativeEvent.layout.width)}
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm }}
          >
            {server.photos.map((p) => (
              <Pressable key={p.id} onPress={() => setEditing(p)} accessibilityRole="button" accessibilityLabel={t(`look_inside.kind.${p.kind}`)}>
                <Image source={{ uri: resolveMediaUrl(p.url) ?? undefined }} style={{ width: tile, height: tile * 1.25, borderRadius: radii.md, backgroundColor: theme.bg.muted }} />
                <View style={{ position: 'absolute', left: 6, bottom: 6, right: 6, flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Badge text={t(`look_inside.kind.${p.kind}`)} />
                  {p.pins.length > 0 && <Badge text={`📍${p.pins.length}`} />}
                </View>
              </Pressable>
            ))}
            {server.photos.length < 12 && (
              <Pressable
                onPress={addPhoto}
                disabled={busy !== null}
                accessibilityRole="button"
                style={{ width: tile, height: tile * 1.25, borderRadius: radii.md, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.border.default, alignItems: 'center', justifyContent: 'center', gap: 4 }}
              >
                <Feather name={busy === 'photo' ? 'loader' : 'plus'} size={24} color={theme.text.secondary} />
                <Text variant="caption" tone="secondary">{busy === 'photo' ? t('portfolio_editor.uploading') : t('portfolio_editor.add_photo')}</Text>
              </Pressable>
            )}
          </View>
          {server.photos.length > 0 && (
            <Text variant="caption" tone="tertiary" style={{ marginTop: spacing.sm }}>{t('portfolio_editor.pins_hint')}</Text>
          )}
        </Card>

        {/* Video */}
        <Card>
          <SectionTitle title={t('portfolio_editor.video_title')} sub={t('portfolio_editor.video_sub')} />
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, alignItems: 'center' }}>
            {server.video ? (
              <>
                <MaterialCommunityIcons name="play-circle-outline" size={28} color={theme.brand.hero} />
                <Text style={{ flex: 1 }}>{t('portfolio_editor.video_set', { s: server.video.durationSeconds })}</Text>
                <Button label={t('portfolio_editor.remove')} variant="ghost" size="sm" fullWidth={false} onPress={() => void run('video', () => portfolioApi.removeVideo())} />
              </>
            ) : null}
            <Button
              label={busy === 'video' ? t('portfolio_editor.uploading') : server.video ? t('portfolio_editor.replace') : t('portfolio_editor.add_video')}
              variant="secondary"
              size="sm"
              fullWidth={!server.video}
              disabled={busy !== null}
              onPress={() =>
                void run('video', async () => {
                  const v = await pickWorkplaceVideo();
                  return v ? portfolioApi.setVideo(v) : null;
                })
              }
            />
          </View>
        </Card>

        {/* About */}
        <Card>
          <SectionTitle title={t('portfolio_editor.about_title')} sub={t('portfolio_editor.about_sub')} />
          <TextInput
            value={draft.about}
            onChangeText={(v) => edit((d) => ({ ...d, about: v.slice(0, 600) }))}
            placeholder={t('portfolio_editor.about_placeholder')}
            placeholderTextColor={theme.text.tertiary}
            multiline
            style={[field, { minHeight: 96, borderWidth: 0.5, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.sm, textAlignVertical: 'top', fontSize: 15 }]}
          />
          <Text variant="caption" tone="tertiary" style={{ alignSelf: 'flex-end', marginTop: 4 }}>{draft.about.length}/600</Text>
        </Card>

        {/* Perks */}
        <Card>
          <SectionTitle title={t('portfolio_editor.perks_title')} sub={t('portfolio_editor.perks_sub')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm }}>
            {draft.perks.map((p) => (
              <Chip key={p} label={p} active onPress={() => edit((d) => ({ ...d, perks: d.perks.filter((x) => x !== p) }))} trailing="×" />
            ))}
            {PERK_SUGGESTIONS.map((k) => t(`portfolio_editor.${k}`))
              .filter((s) => !draft.perks.includes(s))
              .map((s) => (
                <Chip key={s} label={`+ ${s}`} onPress={() => draft.perks.length < 10 && edit((d) => ({ ...d, perks: [...d.perks, s] }))} />
              ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.sm }}>
            <TextInput
              value={perkInput}
              onChangeText={setPerkInput}
              placeholder={t('portfolio_editor.perk_placeholder')}
              placeholderTextColor={theme.text.tertiary}
              maxLength={40}
              style={[field, { flex: 1, borderWidth: 0.5, borderRadius: radii.md, paddingHorizontal: spacing.md, height: 44 }]}
            />
            <Button
              label={t('portfolio_editor.add')}
              size="sm"
              variant="secondary"
              fullWidth={false}
              disabled={!perkInput.trim() || draft.perks.length >= 10}
              onPress={() => {
                const v = perkInput.trim();
                if (v && !draft.perks.includes(v)) edit((d) => ({ ...d, perks: [...d.perks, v] }));
                setPerkInput('');
              }}
            />
          </View>
        </Card>

        {/* Team */}
        <Card>
          <SectionTitle title={t('portfolio_editor.team_title')} sub={t('portfolio_editor.team_sub')} />
          <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
            {draft.team.map((m, i) => (
              <View key={m.key} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
                <Pressable
                  onPress={() =>
                    m.id
                      ? void run('team', async () => {
                          const img = await pickTeamPhoto();
                          return img ? portfolioApi.setTeamPhoto(m.id!, img) : null;
                        })
                      : Alert.alert(t('portfolio_editor.save_first'))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={t('portfolio_editor.team_photo_a11y')}
                >
                  {m.photoUrl ? (
                    <Image source={{ uri: resolveMediaUrl(m.photoUrl) ?? undefined }} style={{ width: 52, height: 52, borderRadius: 26 }} />
                  ) : (
                    <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: theme.bg.muted, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="camera" size={18} color={theme.text.secondary} />
                    </View>
                  )}
                </Pressable>
                <View style={{ flex: 1, gap: 6 }}>
                  <TextInput value={m.name} onChangeText={(v) => edit((d) => ({ ...d, team: d.team.map((x, j) => (j === i ? { ...x, name: v } : x)) }))} placeholder={t('portfolio_editor.team_name')} placeholderTextColor={theme.text.tertiary} maxLength={60} style={[field, { borderWidth: 0.5, borderRadius: radii.md, paddingHorizontal: spacing.md, height: 40 }]} />
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TextInput value={m.role} onChangeText={(v) => edit((d) => ({ ...d, team: d.team.map((x, j) => (j === i ? { ...x, role: v } : x)) }))} placeholder={t('portfolio_editor.team_role')} placeholderTextColor={theme.text.tertiary} maxLength={60} style={[field, { flex: 1, borderWidth: 0.5, borderRadius: radii.md, paddingHorizontal: spacing.md, height: 40 }]} />
                    <TextInput value={m.tenure} onChangeText={(v) => edit((d) => ({ ...d, team: d.team.map((x, j) => (j === i ? { ...x, tenure: v } : x)) }))} placeholder={t('portfolio_editor.team_tenure')} placeholderTextColor={theme.text.tertiary} maxLength={40} style={[field, { flex: 1, borderWidth: 0.5, borderRadius: radii.md, paddingHorizontal: spacing.md, height: 40 }]} />
                  </View>
                </View>
                <Pressable onPress={() => edit((d) => ({ ...d, team: d.team.filter((_, j) => j !== i) }))} hitSlop={8} accessibilityLabel={t('portfolio_editor.remove')}>
                  <Feather name="trash-2" size={18} color={theme.text.tertiary} />
                </Pressable>
              </View>
            ))}
            {draft.team.length < 12 && (
              <Button label={t('portfolio_editor.add_member')} variant="ghost" size="sm" onPress={() => edit((d) => ({ ...d, team: [...d.team, { key: nextKey(), name: '', role: '', tenure: '', photoUrl: null }] }))} />
            )}
          </View>
        </Card>

        {/* FAQs */}
        <Card>
          <SectionTitle title={t('portfolio_editor.faqs_title')} sub={t('portfolio_editor.faqs_sub')} />
          <View style={{ gap: spacing.md, marginTop: spacing.sm }}>
            {draft.faqs.map((f, i) => (
              <View key={f.key} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <TextInput value={f.q} onChangeText={(v) => edit((d) => ({ ...d, faqs: d.faqs.map((x, j) => (j === i ? { ...x, q: v } : x)) }))} placeholder={t('portfolio_editor.faq_q')} placeholderTextColor={theme.text.tertiary} maxLength={160} style={[field, { flex: 1, borderWidth: 0.5, borderRadius: radii.md, paddingHorizontal: spacing.md, height: 40, fontWeight: '600' }]} />
                  <Pressable onPress={() => edit((d) => ({ ...d, faqs: d.faqs.filter((_, j) => j !== i) }))} hitSlop={8} accessibilityLabel={t('portfolio_editor.remove')}>
                    <Feather name="trash-2" size={18} color={theme.text.tertiary} />
                  </Pressable>
                </View>
                <TextInput value={f.a} onChangeText={(v) => edit((d) => ({ ...d, faqs: d.faqs.map((x, j) => (j === i ? { ...x, a: v } : x)) }))} placeholder={t('portfolio_editor.faq_a')} placeholderTextColor={theme.text.tertiary} maxLength={600} multiline style={[field, { borderWidth: 0.5, borderRadius: radii.md, padding: spacing.md, minHeight: 60, textAlignVertical: 'top' }]} />
              </View>
            ))}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {FAQ_SUGGESTIONS.map((k) => t(`portfolio_editor.${k}`))
                .filter((s) => !draft.faqs.some((f) => f.q === s))
                .map((s) => (
                  <Chip key={s} label={`+ ${s}`} onPress={() => draft.faqs.length < 10 && edit((d) => ({ ...d, faqs: [...d.faqs, { key: nextKey(), q: s, a: '' }] }))} />
                ))}
            </View>
            {draft.faqs.length < 10 && (
              <Button label={t('portfolio_editor.add_faq')} variant="ghost" size="sm" onPress={() => edit((d) => ({ ...d, faqs: [...d.faqs, { key: nextKey(), q: '', a: '' }] }))} />
            )}
          </View>
        </Card>
      </ScrollView>

      {/* Save bar */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: theme.bg.canvas, borderTopWidth: 0.5, borderTopColor: theme.border.default, gap: 6 }}>
        {error ? <Text variant="footnote" tone="danger" style={{ textAlign: 'center' }}>{error}</Text> : null}
        <Button
          label={saveMutation.isPending ? t('portfolio_editor.saving') : dirty ? t('portfolio_editor.save') : t('portfolio_editor.saved')}
          disabled={!dirty || saveMutation.isPending}
          onPress={() => saveMutation.mutate()}
        />
      </View>

      {editing && (
        <PhotoEditor
          photo={editing}
          jobs={jobs}
          busy={busy !== null}
          onClose={() => setEditing(null)}
          onDelete={() =>
            Alert.alert(t('portfolio_editor.delete_photo_q'), undefined, [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('portfolio_editor.remove'),
                style: 'destructive',
                onPress: () => {
                  const id = editing.id;
                  setEditing(null);
                  void run('photo', () => portfolioApi.removePhoto(id));
                },
              },
            ])
          }
          onSave={(updated) => {
            setEditing(null);
            void run('pins', () => portfolioApi.update({ photos: photosPatch(server.photos.map((p) => (p.id === updated.id ? updated : p))) }));
          }}
          onMoveFirst={() => {
            const id = editing.id;
            setEditing(null);
            const ordered = [server.photos.find((p) => p.id === id)!, ...server.photos.filter((p) => p.id !== id)];
            void run('order', () => portfolioApi.update({ photos: photosPatch(ordered) }));
          }}
          t={t}
        />
      )}
    </Screen>
  );
}

// ─── Photo editor (kind, caption, role pins) ────────────────────────────────

function PhotoEditor({
  photo,
  jobs,
  busy,
  onClose,
  onDelete,
  onSave,
  onMoveFirst,
  t,
}: {
  photo: PortfolioPhoto;
  jobs: PublicJob[];
  busy: boolean;
  onClose: () => void;
  onDelete: () => void;
  onSave: (p: PortfolioPhoto) => void;
  onMoveFirst: () => void;
  t: TFn;
}) {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  const size = useImageSize(photo.url);
  const [kind, setKind] = useState<PhotoKind>(photo.kind);
  const [caption, setCaption] = useState(photo.caption ?? '');
  const [pins, setPins] = useState(photo.pins);
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [labelInput, setLabelInput] = useState('');

  // Fit the photo (contain) so pin coordinates map to the real image.
  const box = useMemo(() => {
    const maxW = width - 32;
    const maxH = height * 0.48;
    if (!size) return { w: maxW, h: maxW * 1.25 };
    const s = Math.min(maxW / size.w, maxH / size.h);
    return { w: size.w * s, h: size.h * s };
  }, [size, width, height]);

  const addPin = (label: string, jobId: string | null) => {
    if (!pending || !label.trim()) return;
    setPins((ps) => [...ps, { id: nextKey(), x: pending.x, y: pending.y, jobId, label: label.trim() }]);
    setPending(null);
    setLabelInput('');
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md }}>
          <Pressable onPress={onClose} hitSlop={10}><Feather name="x" size={24} color={theme.text.primary} /></Pressable>
          <Text variant="bodyLarge" weight="medium" style={{ flex: 1 }}>{t('portfolio_editor.edit_photo')}</Text>
          <Pressable onPress={onDelete} hitSlop={10} accessibilityLabel={t('portfolio_editor.remove')}><Feather name="trash-2" size={20} color={theme.status.danger} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, gap: spacing.md }} keyboardShouldPersistTaps="handled">
          <Pressable
            onPress={(e) => {
              const { locationX, locationY } = e.nativeEvent;
              if (pins.length >= 6) return;
              setPending({ x: Math.min(1, Math.max(0, locationX / box.w)), y: Math.min(1, Math.max(0, locationY / box.h)) });
            }}
            style={{ width: box.w, height: box.h, alignSelf: 'center' }}
          >
            <Image source={{ uri: resolveMediaUrl(photo.url) ?? undefined }} style={{ width: box.w, height: box.h, borderRadius: radii.md }} />
            {pins.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => setPins((ps) => ps.filter((x) => x.id !== p.id))}
                style={{ position: 'absolute', left: p.x * box.w - 60, top: p.y * box.h - 38, width: 120, alignItems: 'center' }}
                accessibilityLabel={t('portfolio_editor.remove_pin_a11y', { label: p.label })}
              >
                <View style={{ backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                  <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 12, maxWidth: 90 }}>{p.label}</Text>
                  <Text style={{ color: '#FFB4A8', fontSize: 12 }}>×</Text>
                </View>
                <View style={{ width: 2, height: 14, backgroundColor: '#FFC56B' }} />
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: '#FFB23F' }} />
              </Pressable>
            ))}
            {pending && (
              <View pointerEvents="none" style={{ position: 'absolute', left: pending.x * box.w - 8, top: pending.y * box.h - 8, width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFB23F', borderWidth: 3, borderColor: '#FFFFFF' }} />
            )}
          </Pressable>
          <Text variant="caption" tone="tertiary" style={{ textAlign: 'center' }}>{t('portfolio_editor.tap_to_pin')}</Text>

          {pending && (
            <Card>
              <Text variant="footnote" weight="medium">{t('portfolio_editor.pin_which_job')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm }}>
                {jobs.map((j) => (
                  <Chip key={j.id} label={j.title} onPress={() => addPin(j.title, j.id)} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <TextField value={labelInput} onChangeText={setLabelInput} placeholder={t('portfolio_editor.pin_label_only')} maxLength={60} />
                </View>
                <Button label={t('portfolio_editor.add')} size="sm" variant="secondary" fullWidth={false} disabled={!labelInput.trim()} onPress={() => addPin(labelInput, null)} />
              </View>
              <Button label={t('common.cancel')} variant="ghost" size="sm" onPress={() => setPending(null)} />
            </Card>
          )}

          <Text variant="footnote" weight="medium" tone="secondary">{t('portfolio_editor.photo_kind')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PHOTO_KINDS.map((k) => (
              <Chip key={k} label={t(`look_inside.kind.${k}`)} active={kind === k} onPress={() => setKind(k)} />
            ))}
          </View>
          <TextField label={t('portfolio_editor.caption')} value={caption} onChangeText={setCaption} maxLength={80} placeholder={t('portfolio_editor.caption_placeholder')} />
          <Button label={t('portfolio_editor.make_cover')} variant="ghost" size="sm" onPress={onMoveFirst} disabled={busy} />
        </ScrollView>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: theme.bg.canvas }}>
          <Button label={t('portfolio_editor.done')} disabled={busy} onPress={() => onSave({ ...photo, kind, caption: caption.trim() || null, pins })} />
        </View>
      </Screen>
    </Modal>
  );
}

// ─── Small pieces ───────────────────────────────────────────────────────────

function Header({ onBack, onPreview, t }: { onBack: () => void; onPreview?: () => void; t: TFn }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.md }}>
      <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button"><Feather name="arrow-left" size={22} color={theme.text.primary} /></Pressable>
      <Text variant="bodyLarge" weight="medium" style={{ flex: 1 }}>{t('portfolio_editor.title')}</Text>
      {onPreview && (
        <Pressable onPress={onPreview} hitSlop={8} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name="eye" size={16} color={theme.brand.hero} />
          <Text variant="footnote" tone="hero" weight="medium">{t('portfolio_editor.preview')}</Text>
        </Pressable>
      )}
    </View>
  );
}

function SectionTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="bodyLarge" weight="medium">{title}</Text>
      <Text variant="footnote" tone="secondary">{sub}</Text>
    </View>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 10 }}>{text}</Text>
    </View>
  );
}

function Chip({ label, active, onPress, trailing }: { label: string; active?: boolean; onPress: () => void; trailing?: string }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 0.5, borderColor: active ? theme.brand.hero : theme.border.default, backgroundColor: active ? theme.brand.heroSubtle : 'transparent', flexDirection: 'row', gap: 4 }}
    >
      <Text variant="footnote" style={{ color: active ? theme.brand.hero : theme.text.secondary }}>{label}</Text>
      {trailing ? <Text variant="footnote" style={{ color: theme.text.tertiary }}>{trailing}</Text> : null}
    </Pressable>
  );
}
