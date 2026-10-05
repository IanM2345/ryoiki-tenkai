'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getStudyNodes, getStudyLinks, getStudyCards, getStudyResources,
  type DbStudyCard, type DbStudyLink, type DbStudyNode, type DbStudyResource,
} from '@/lib/db';
import { ensureSession } from '@/lib/supabase';
import { useLiveTables } from '@/lib/realtime';
import { buildTree, computeStats } from '@/lib/study';

/** Everything in Learn, kept in sync across her devices. */
export function useStudy(onError: (msg: string) => void) {
  const [nodes, setNodes] = useState<DbStudyNode[]>([]);
  const [links, setLinks] = useState<DbStudyLink[]>([]);
  const [cards, setCards] = useState<DbStudyCard[]>([]);
  const [resources, setResources] = useState<DbStudyResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  const reload = useCallback(async () => {
    try {
      if (!(await ensureSession())) return;
      const [n, l, c, r] = await Promise.all([getStudyNodes(), getStudyLinks(), getStudyCards(), getStudyResources()]);
      setNodes(n); setLinks(l); setCards(c); setResources(r);
      setMissing(false);
    } catch (e) {
      // The tables aren't there yet: the database update hasn't been applied.
      if (/does not exist|schema cache|Could not find/i.test((e as Error)?.message ?? '')) setMissing(true);
      else onError('Could not load your study map.');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => { reload(); }, [reload]);
  useLiveTables(['study_nodes', 'study_links', 'study_cards', 'study_resources'], reload);

  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const stats = useMemo(() => computeStats(tree, cards), [tree, cards]);

  return { nodes, setNodes, links, setLinks, cards, setCards, resources, setResources, tree, stats, loading, missing, reload };
}
