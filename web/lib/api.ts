// All calls below are relative — proxied through this same origin to the
// real backend via next.config.mjs's rewrites, not called directly, so a
// session cookie set during the OAuth flow ends up scoped to this domain
// instead of one the browser will never send it back to. credentials:
// 'include' is harmless-but-unnecessary here now; left on in case a caller
// ever bypasses the proxy.
function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, credentials: 'include' });
}

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_API_URL) {
  // Loud on purpose — NEXT_PUBLIC_API_URL is read by next.config.mjs at
  // build time to set the rewrite destination; if it's unset there, every
  // proxied /api and /auth call silently targets localhost:8000 instead of
  // the real backend, and this build's requests just fail with no clue why.
  console.error(
    '[job-serach] NEXT_PUBLIC_API_URL is not set in this production build — ' +
    'the API/auth proxy falls back to http://localhost:8000, which will not work. Set it in Vercel\'s project env vars and redeploy.'
  );
}

export interface Job {
  id: string;
  title: string;
  company: string;
  score: number;
  location: string;
  salary?: string;
  source: string;
  status: 'found' | 'applied' | 'interviewing' | 'offer' | 'rejected' | 'ghosted';
  url: string;
  score_reason?: string;
  description?: string;
  notes?: string;
  starred?: boolean | number;
  cv_path?: string;
  cover_letter_path?: string;
  date_found?: string;
  date_applied?: string;
}

export interface Stats {
  total: number;
  found: number;
  applied: number;
  interviewing: number;
  offers: number;
  rejected: number;
  ghosted: number;
  avg_score: number;
  high_match: number;
}

export interface JobsResponse {
  jobs: Job[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface TrainTopic {
  key: string;
  name: string;
  description: string;
  icon: string;
}

export interface TrainSession {
  session_id: string;
  topic_key: string;
  topic_name: string;
  message: string;
}

export interface TrainMessage {
  role: 'user' | 'assistant';
  content: string;
  score?: number;
  timestamp?: string;
}

export interface TrainProgress {
  sessions_completed: number;
  avg_score: number;
  topics_covered: string[];
  total_messages: number;
}

export interface LearningItem {
  id: string;
  title: string;
  item_type: 'book' | 'course' | 'skill';
  phase: number;
  order_index: number;
  status: 'not_started' | 'in_progress' | 'done';
  notes?: string;
  updated_at?: string;
  topic_count?: number;
  topics_covered?: number;
  coverage_score?: number | null;
}

export interface LearningTopic {
  id: string;
  item_id: string;
  topic_name: string;
  order_index: number;
  covered: number | boolean;
}

export interface LearningBook {
  id: string;
  title: string;
  filename: string;
  page_count: number;
  current_page: number;
  uploaded_at: string;
  cloudinary_url?: string;
}

export interface BookPage {
  id: string;
  book_id: string;
  page_num: number;
  text: string;
  summary?: string | null;
}

export interface LearningMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Story {
  id: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
  tags: string[];
  source_job_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudyVideo {
  id: string;
  playlist_id: string;
  video_id: string;
  title: string;
  url: string;
  transcript?: string;
  notes_md?: string;
  source?: string;
  status: 'pending' | 'transcribing' | 'embedding' | 'done' | 'failed';
  error?: string;
  created_at: string;
}

export interface StudyPlaylist {
  id: string;
  url: string;
  title: string;
  status: string;
  created_at: string;
  videos?: StudyVideo[];
}

export interface InterviewRound {
  id: string;
  job_id: string;
  round_num: number;
  round_type: string;
  scheduled_at?: string;
  result: string;
  notes?: string;
  created_at: string;
}

export interface BatchItem {
  id: string;
  batch_id: string;
  job_id: string;
  title: string;
  company: string;
  score: number;
  email?: string;
  cv_path?: string;
  cover_path?: string;
  screenshot_url?: string;
  fields_filled?: string;
  fields_missing?: string;
  approved: number;
  status: string;
  error?: string;
}

export interface Batch {
  id: string;
  mode: 'automatic' | 'review';
  channel: 'email' | 'telegram' | 'browser';
  status: string;
  created_at: string;
  items: BatchItem[];
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  created_at: string;
}

// Relative, not `${API}/...` — must go through this same origin (see
// next.config.mjs's rewrites) so the whole OAuth dance, not just later
// fetch() calls, ends up with the session cookie scoped to this domain.
export const AUTH_LOGIN_URL = `/auth/google/login`;

export const api = {
  me: (): Promise<AuthUser | null> =>
    apiFetch(`/auth/me`).then((r) => (r.ok ? r.json() : null)),

  logout: (): Promise<{ ok: boolean }> =>
    apiFetch(`/auth/logout`, { method: 'POST' }).then((r) => r.json()),

  stats: (): Promise<Stats> =>
    apiFetch(`/api/stats`).then((r) => {
      if (!r.ok) throw new Error(`Stats failed: ${r.status}`);
      return r.json();
    }),

  jobs: (params: Record<string, string | number | boolean>): Promise<JobsResponse> =>
    apiFetch(`/api/jobs?${new URLSearchParams(params as Record<string, string>)}`).then((r) => {
      if (!r.ok) throw new Error(`Jobs failed: ${r.status}`);
      return r.json();
    }),

  job: (id: string): Promise<Job> =>
    apiFetch(`/api/jobs/${id}`).then((r) => {
      if (!r.ok) throw new Error(`Job failed: ${r.status}`);
      return r.json();
    }),

  jobLegitimacy: (id: string): Promise<{ score: number | null; flags: string[] }> =>
    apiFetch(`/api/jobs/${id}/legitimacy`).then((r) => {
      if (!r.ok) throw new Error(`Legitimacy check failed: ${r.status}`);
      return r.json();
    }),

  jobContact: (id: string): Promise<{ search_query: string; search_url: string; message_draft: string }> =>
    apiFetch(`/api/jobs/${id}/contact`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Contact discovery failed: ${r.status}`);
      return r.json();
    }),

  apply: (id: string): Promise<{ cv: string; cover_letter: string; cv_path: string; cover_path: string; apply_url: string }> =>
    apiFetch(`/api/apply/${id}`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Apply failed: ${r.status}`);
      return r.json();
    }),

  emailApply: (id: string, toEmail?: string): Promise<{ ok: boolean; sent_to: string } | { error: string }> =>
    apiFetch(`/api/email-apply/${id}${toEmail ? `?to_email=${encodeURIComponent(toEmail)}` : ''}`, {
      method: 'POST',
    }).then((r) => r.json()),

  update: (id: string, status: string, notes = ''): Promise<{ ok: boolean }> =>
    apiFetch(`/api/update/${id}?status=${status}&notes=${encodeURIComponent(notes)}`, {
      method: 'POST',
    }).then((r) => {
      if (!r.ok) throw new Error(`Update failed: ${r.status}`);
      return r.json();
    }),

  saveNotes: (id: string, notes: string): Promise<{ ok: boolean }> =>
    apiFetch(`/api/notes/${id}?notes=${encodeURIComponent(notes)}`, {
      method: 'POST',
    }).then((r) => {
      if (!r.ok) throw new Error(`Notes save failed: ${r.status}`);
      return r.json();
    }),

  starJob: (id: string): Promise<{ starred: boolean }> =>
    apiFetch(`/api/jobs/${id}/star`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Star failed: ${r.status}`);
      return r.json();
    }),

  findStream: (): EventSource => new EventSource(`/api/find`, { withCredentials: true }),

  export: (): void => {
    window.open(`/api/export`);
  },

  downloadCV: (jobId: string): void => {
    window.open(`/api/files/cv/${jobId}`);
  },

  downloadCover: (jobId: string): void => {
    window.open(`/api/files/cover/${jobId}`);
  },

  trainTopics: (): Promise<TrainTopic[]> =>
    apiFetch(`/api/train/topics`).then((r) => {
      if (!r.ok) throw new Error(`Topics failed: ${r.status}`);
      return r.json();
    }),

  trainStart: (topicKey: string): Promise<TrainSession> =>
    apiFetch(`/api/train/start?topic_key=${topicKey}`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Train start failed: ${r.status}`);
      return r.json();
    }),

  trainChat: (
    sessionId: string,
    message: string
  ): Promise<{ response: string; score?: number; avg_score?: number }> =>
    apiFetch(
      `/api/train/chat?session_id=${sessionId}&message=${encodeURIComponent(message)}`,
      { method: 'POST' }
    ).then((r) => {
      if (!r.ok) throw new Error(`Train chat failed: ${r.status}`);
      return r.json();
    }),

  trainProgress: (): Promise<TrainProgress> =>
    apiFetch(`/api/train/progress`).then((r) => {
      if (!r.ok) throw new Error(`Progress failed: ${r.status}`);
      return r.json();
    }),

  learningTopics: (): Promise<LearningItem[]> =>
    apiFetch(`/api/learning/topics`).then((r) => {
      if (!r.ok) throw new Error(`Learning topics failed: ${r.status}`);
      return r.json();
    }),

  setLearningStatus: (itemId: string, status: string): Promise<{ ok: boolean }> =>
    apiFetch(`/api/learning/${itemId}/status?status=${status}`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Learning status update failed: ${r.status}`);
      return r.json();
    }),

  learningChat: (itemId: string, message: string): Promise<{ response: string }> =>
    apiFetch(`/api/learning/${itemId}/chat?message=${encodeURIComponent(message)}`, {
      method: 'POST',
    }).then((r) => {
      if (!r.ok) throw new Error(`Learning chat failed: ${r.status}`);
      return r.json();
    }),

  addLearningSkill: (title: string): Promise<{ ok: boolean; item_id: string }> =>
    apiFetch(`/api/learning/skills?title=${encodeURIComponent(title)}`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Add skill failed: ${r.status}`);
      return r.json();
    }),

  getItemTopics: (itemId: string): Promise<LearningTopic[]> =>
    apiFetch(`/api/learning/${itemId}/topics`).then((r) => {
      if (!r.ok) throw new Error(`Get topics failed: ${r.status}`);
      return r.json();
    }),

  toggleTopic: (topicId: string): Promise<{ ok: boolean; covered: boolean }> =>
    apiFetch(`/api/learning/topics/${topicId}/toggle`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Toggle topic failed: ${r.status}`);
      return r.json();
    }),

  uploadBook: (file: File): Promise<{ ok: boolean; book_id: string; page_count: number }> => {
    const formData = new FormData();
    formData.append('file', file);
    return apiFetch(`/api/learning/books/upload`, { method: 'POST', body: formData }).then((r) => {
      if (!r.ok) throw new Error(`Book upload failed: ${r.status}`);
      return r.json();
    });
  },

  listBooks: (): Promise<LearningBook[]> =>
    apiFetch(`/api/learning/books`).then((r) => {
      if (!r.ok) throw new Error(`List books failed: ${r.status}`);
      return r.json();
    }),

  getBookPage: (bookId: string, pageNum: number): Promise<BookPage> =>
    apiFetch(`/api/learning/books/${bookId}/page/${pageNum}`).then((r) => {
      if (!r.ok) throw new Error(`Get page failed: ${r.status}`);
      return r.json();
    }),

  summarizeBookPage: (bookId: string, pageNum: number): Promise<{ summary: string; cached: boolean }> =>
    apiFetch(`/api/learning/books/${bookId}/page/${pageNum}/summary`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Summarize page failed: ${r.status}`);
      return r.json();
    }),

  bookChat: (bookId: string, pageNum: number, message: string): Promise<{ response: string }> =>
    apiFetch(
      `/api/learning/books/${bookId}/chat?page_num=${pageNum}&message=${encodeURIComponent(message)}`,
      { method: 'POST' }
    ).then((r) => {
      if (!r.ok) throw new Error(`Book chat failed: ${r.status}`);
      return r.json();
    }),

  ingestPlaylist: (url: string): Promise<{ ok: boolean; playlist_id: string }> =>
    apiFetch(`/api/learning/playlists/ingest?url=${encodeURIComponent(url)}`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Playlist ingest failed: ${r.status}`);
      return r.json();
    }),

  listPlaylists: (): Promise<StudyPlaylist[]> =>
    apiFetch(`/api/learning/playlists`).then((r) => {
      if (!r.ok) throw new Error(`List playlists failed: ${r.status}`);
      return r.json();
    }),

  getPlaylist: (id: string): Promise<StudyPlaylist> =>
    apiFetch(`/api/learning/playlists/${id}`).then((r) => {
      if (!r.ok) throw new Error(`Get playlist failed: ${r.status}`);
      return r.json();
    }),

  askPlaylists: (question: string, playlistId?: string): Promise<{ answer: string; sources: string[] }> =>
    apiFetch(
      `/api/learning/playlists/ask?question=${encodeURIComponent(question)}` +
        (playlistId ? `&playlist_id=${playlistId}` : ''),
      { method: 'POST' }
    ).then((r) => {
      if (!r.ok) throw new Error(`Ask failed: ${r.status}`);
      return r.json();
    }),

  stories: (): Promise<Story[]> =>
    apiFetch(`/api/stories`).then((r) => {
      if (!r.ok) throw new Error(`Stories fetch failed: ${r.status}`);
      return r.json();
    }),

  draftStory: (notes: string): Promise<Omit<Story, 'id' | 'source_job_id' | 'created_at' | 'updated_at'>> =>
    apiFetch(`/api/stories/draft?notes=${encodeURIComponent(notes)}`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Draft story failed: ${r.status}`);
      return r.json();
    }),

  addStory: (story: {
    situation: string; task: string; action: string; result: string; reflection: string; tags: string[];
  }): Promise<{ ok: boolean; id: string }> => {
    const params = new URLSearchParams({
      situation: story.situation, task: story.task, action: story.action,
      result: story.result, reflection: story.reflection, tags: story.tags.join(','),
    });
    return apiFetch(`/api/stories?${params.toString()}`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Add story failed: ${r.status}`);
      return r.json();
    });
  },

  updateStory: (id: string, story: {
    situation: string; task: string; action: string; result: string; reflection: string; tags: string[];
  }): Promise<{ ok: boolean }> => {
    const params = new URLSearchParams({
      situation: story.situation, task: story.task, action: story.action,
      result: story.result, reflection: story.reflection, tags: story.tags.join(','),
    });
    return apiFetch(`/api/stories/${id}?${params.toString()}`, { method: 'PUT' }).then((r) => {
      if (!r.ok) throw new Error(`Update story failed: ${r.status}`);
      return r.json();
    });
  },

  deleteStory: (id: string): Promise<{ ok: boolean }> =>
    apiFetch(`/api/stories/${id}`, { method: 'DELETE' }).then((r) => {
      if (!r.ok) throw new Error(`Delete story failed: ${r.status}`);
      return r.json();
    }),

  resume: (): Promise<Record<string, unknown>> =>
    apiFetch(`/api/resume`).then((r) => {
      if (!r.ok) throw new Error(`Resume fetch failed: ${r.status}`);
      return r.json();
    }),

  saveResume: (data: Record<string, unknown>): Promise<{ ok: boolean }> =>
    apiFetch(`/api/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then((r) => {
      if (!r.ok) throw new Error(`Resume save failed: ${r.status}`);
      return r.json();
    }),

  statsTimeline: (): Promise<{ timeline: { date: string; found: number; applied: number }[] }> =>
    apiFetch(`/api/stats/timeline`).then((r) => {
      if (!r.ok) throw new Error(`Timeline failed: ${r.status}`);
      return r.json();
    }),

  analytics: (): Promise<Record<string, unknown>> =>
    apiFetch(`/api/analytics`).then((r) => {
      if (!r.ok) throw new Error(`Analytics failed: ${r.status}`);
      return r.json();
    }),

  salaryStats: async (): Promise<{
    ranges: { label: string; count: number }[];
    avg_mentioned: number;
    jobs_with_salary: number;
  }> => {
    const r = await apiFetch(`/api/jobs?per_page=500`);
    if (!r.ok) throw new Error(`Jobs failed: ${r.status}`);
    const data: JobsResponse = await r.json();
    const jobs: Job[] = data.jobs || [];

    const buckets: Record<string, number> = {
      'No salary listed': 0,
      '< 5 LPA': 0,
      '5–8 LPA': 0,
      '8–12 LPA': 0,
      '12+ LPA': 0,
    };

    let totalMentioned = 0;
    let jobsWithSalary = 0;

    for (const job of jobs) {
      const raw = (job.salary || '').toLowerCase().replace(/,/g, '');
      // Try to extract a numeric LPA value
      const lpaMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:lpa|l\s*p\s*a|lakh)/i);
      const kMatch = raw.match(/(\d+(?:\.\d+)?)\s*k/i); // e.g. "800k INR" unlikely but handle
      const rangeMatch = raw.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(?:lpa|l\s*p\s*a|lakh)/i);

      let lpa: number | null = null;

      if (rangeMatch) {
        lpa = (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2;
      } else if (lpaMatch) {
        lpa = parseFloat(lpaMatch[1]);
      } else if (kMatch && (raw.includes('inr') || raw.includes('₹'))) {
        // e.g. "800k INR" → 8 LPA roughly (800000 / 100000)
        lpa = parseFloat(kMatch[1]) * 1000 / 100000;
      }

      if (lpa !== null && !isNaN(lpa) && lpa > 0) {
        jobsWithSalary++;
        totalMentioned += lpa;
        if (lpa < 5) buckets['< 5 LPA']++;
        else if (lpa < 8) buckets['5–8 LPA']++;
        else if (lpa < 12) buckets['8–12 LPA']++;
        else buckets['12+ LPA']++;
      } else {
        buckets['No salary listed']++;
      }
    }

    const ranges = Object.entries(buckets).map(([label, count]) => ({ label, count }));
    const avg_mentioned = jobsWithSalary > 0 ? Math.round((totalMentioned / jobsWithSalary) * 10) / 10 : 0;

    return { ranges, avg_mentioned, jobs_with_salary: jobsWithSalary };
  },

  followups: (): Promise<{ jobs: Job[] }> =>
    apiFetch(`/api/followups`).then((r) => {
      if (!r.ok) throw new Error(`Followups failed: ${r.status}`);
      return r.json();
    }),

  getAutoApplyMode: (): Promise<{ mode: 'automatic' | 'review' }> =>
    apiFetch(`/api/settings/auto-apply-mode`).then((r) => {
      if (!r.ok) throw new Error(`Get mode failed: ${r.status}`);
      return r.json();
    }),

  setAutoApplyMode: (mode: 'automatic' | 'review'): Promise<{ ok: boolean; mode: string }> =>
    apiFetch(`/api/settings/auto-apply-mode?mode=${mode}`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Set mode failed: ${r.status}`);
      return r.json();
    }),

  runBatch: (channel: 'email' | 'telegram' | 'browser', jobIds: string[], mode?: string, force?: boolean): Promise<Batch> => {
    const params = new URLSearchParams({ channel, job_ids: jobIds.join(',') });
    if (mode) params.set('mode', mode);
    if (force) params.set('force', 'true');
    return apiFetch(`/api/batch/run?${params.toString()}`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Run batch failed: ${r.status}`);
      return r.json();
    });
  },

  getBatch: (batchId: string): Promise<Batch> =>
    apiFetch(`/api/batch/${batchId}`).then((r) => {
      if (!r.ok) throw new Error(`Get batch failed: ${r.status}`);
      return r.json();
    }),

  setBatchItemApproval: (batchId: string, itemId: string, approved: boolean): Promise<{ ok: boolean }> =>
    apiFetch(`/api/batch/${batchId}/items/${itemId}/approval?approved=${approved}`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Approval update failed: ${r.status}`);
      return r.json();
    }),

  sendBatch: (batchId: string): Promise<Batch> =>
    apiFetch(`/api/batch/${batchId}/send`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Send batch failed: ${r.status}`);
      return r.json();
    }),

  userProfile: (): Promise<Record<string, unknown>> =>
    apiFetch(`/api/user/profile`).then((r) => {
      if (!r.ok) throw new Error(`Profile failed: ${r.status}`);
      return r.json();
    }),

  saveProfile: (data: Record<string, unknown>): Promise<{ ok: boolean }> =>
    apiFetch(`/api/user/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then((r) => {
      if (!r.ok) throw new Error(`Profile save failed: ${r.status}`);
      return r.json();
    }),

  updateStatus: (id: string, status: string): Promise<{ ok: boolean }> =>
    apiFetch(`/api/update/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).then((r) => {
      if (!r.ok) throw new Error(`Update status failed: ${r.status}`);
      return r.json();
    }),

  bulkAction: (action: string, ids: string[], value?: string): Promise<{ updated: number }> =>
    apiFetch(`/api/jobs/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids, value }),
    }).then((r) => r.json()),

  cvContent: (jobId: string): Promise<{ content: string | null }> =>
    apiFetch(`/api/files/cv/${jobId}/content`).then((r) => r.json()),

  getInterviews: (jobId: string): Promise<{ rounds: InterviewRound[] }> =>
    apiFetch(`/api/interview/${jobId}`).then((r) => r.json()),

  addInterview: (
    jobId: string,
    data: { round_type: string; scheduled_at?: string; notes?: string }
  ): Promise<InterviewRound> =>
    apiFetch(`/api/interview/${jobId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  updateInterview: (
    roundId: string,
    data: { result?: string; notes?: string; scheduled_at?: string }
  ): Promise<InterviewRound> =>
    apiFetch(`/api/interview/round/${roundId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  blacklistCompany: (jobId: string): Promise<{ blacklisted: boolean; company: string }> =>
    apiFetch(`/api/jobs/${jobId}/blacklist`, { method: 'POST' }).then((r) => r.json()),
};
