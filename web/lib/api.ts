const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_API_URL) {
  // Loud on purpose — a silent fallback to localhost:8000 in a deployed build
  // means every API call fails, but looks like a generic network error with
  // no clue why. This is the single most load-bearing env var in this deploy.
  console.error(
    '[job-serach] NEXT_PUBLIC_API_URL is not set in this production build — ' +
    'falling back to http://localhost:8000, which will not work. Set it in Vercel\'s project env vars and redeploy.'
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

export const api = {
  stats: (): Promise<Stats> =>
    fetch(`${API}/api/stats`).then((r) => {
      if (!r.ok) throw new Error(`Stats failed: ${r.status}`);
      return r.json();
    }),

  jobs: (params: Record<string, string | number | boolean>): Promise<JobsResponse> =>
    fetch(`${API}/api/jobs?${new URLSearchParams(params as Record<string, string>)}`).then((r) => {
      if (!r.ok) throw new Error(`Jobs failed: ${r.status}`);
      return r.json();
    }),

  job: (id: string): Promise<Job> =>
    fetch(`${API}/api/jobs/${id}`).then((r) => {
      if (!r.ok) throw new Error(`Job failed: ${r.status}`);
      return r.json();
    }),

  apply: (id: string): Promise<{ cv: string; cover_letter: string; cv_path: string; cover_path: string; apply_url: string }> =>
    fetch(`${API}/api/apply/${id}`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Apply failed: ${r.status}`);
      return r.json();
    }),

  emailApply: (id: string, toEmail?: string): Promise<{ ok: boolean; sent_to: string } | { error: string }> =>
    fetch(`${API}/api/email-apply/${id}${toEmail ? `?to_email=${encodeURIComponent(toEmail)}` : ''}`, {
      method: 'POST',
    }).then((r) => r.json()),

  update: (id: string, status: string, notes = ''): Promise<{ ok: boolean }> =>
    fetch(`${API}/api/update/${id}?status=${status}&notes=${encodeURIComponent(notes)}`, {
      method: 'POST',
    }).then((r) => {
      if (!r.ok) throw new Error(`Update failed: ${r.status}`);
      return r.json();
    }),

  saveNotes: (id: string, notes: string): Promise<{ ok: boolean }> =>
    fetch(`${API}/api/notes/${id}?notes=${encodeURIComponent(notes)}`, {
      method: 'POST',
    }).then((r) => {
      if (!r.ok) throw new Error(`Notes save failed: ${r.status}`);
      return r.json();
    }),

  starJob: (id: string): Promise<{ starred: boolean }> =>
    fetch(`${API}/api/jobs/${id}/star`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Star failed: ${r.status}`);
      return r.json();
    }),

  findStream: (): EventSource => new EventSource(`${API}/api/find`),

  export: (): void => {
    window.open(`${API}/api/export`);
  },

  downloadCV: (jobId: string): void => {
    window.open(`${API}/api/files/cv/${jobId}`);
  },

  downloadCover: (jobId: string): void => {
    window.open(`${API}/api/files/cover/${jobId}`);
  },

  trainTopics: (): Promise<TrainTopic[]> =>
    fetch(`${API}/api/train/topics`).then((r) => {
      if (!r.ok) throw new Error(`Topics failed: ${r.status}`);
      return r.json();
    }),

  trainStart: (topicKey: string): Promise<TrainSession> =>
    fetch(`${API}/api/train/start?topic_key=${topicKey}`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Train start failed: ${r.status}`);
      return r.json();
    }),

  trainChat: (
    sessionId: string,
    message: string
  ): Promise<{ response: string; score?: number; avg_score?: number }> =>
    fetch(
      `${API}/api/train/chat?session_id=${sessionId}&message=${encodeURIComponent(message)}`,
      { method: 'POST' }
    ).then((r) => {
      if (!r.ok) throw new Error(`Train chat failed: ${r.status}`);
      return r.json();
    }),

  trainProgress: (): Promise<TrainProgress> =>
    fetch(`${API}/api/train/progress`).then((r) => {
      if (!r.ok) throw new Error(`Progress failed: ${r.status}`);
      return r.json();
    }),

  learningTopics: (): Promise<LearningItem[]> =>
    fetch(`${API}/api/learning/topics`).then((r) => {
      if (!r.ok) throw new Error(`Learning topics failed: ${r.status}`);
      return r.json();
    }),

  setLearningStatus: (itemId: string, status: string): Promise<{ ok: boolean }> =>
    fetch(`${API}/api/learning/${itemId}/status?status=${status}`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Learning status update failed: ${r.status}`);
      return r.json();
    }),

  learningChat: (itemId: string, message: string): Promise<{ response: string }> =>
    fetch(`${API}/api/learning/${itemId}/chat?message=${encodeURIComponent(message)}`, {
      method: 'POST',
    }).then((r) => {
      if (!r.ok) throw new Error(`Learning chat failed: ${r.status}`);
      return r.json();
    }),

  addLearningSkill: (title: string): Promise<{ ok: boolean; item_id: string }> =>
    fetch(`${API}/api/learning/skills?title=${encodeURIComponent(title)}`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Add skill failed: ${r.status}`);
      return r.json();
    }),

  getItemTopics: (itemId: string): Promise<LearningTopic[]> =>
    fetch(`${API}/api/learning/${itemId}/topics`).then((r) => {
      if (!r.ok) throw new Error(`Get topics failed: ${r.status}`);
      return r.json();
    }),

  toggleTopic: (topicId: string): Promise<{ ok: boolean; covered: boolean }> =>
    fetch(`${API}/api/learning/topics/${topicId}/toggle`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Toggle topic failed: ${r.status}`);
      return r.json();
    }),

  uploadBook: (file: File): Promise<{ ok: boolean; book_id: string; page_count: number }> => {
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`${API}/api/learning/books/upload`, { method: 'POST', body: formData }).then((r) => {
      if (!r.ok) throw new Error(`Book upload failed: ${r.status}`);
      return r.json();
    });
  },

  listBooks: (): Promise<LearningBook[]> =>
    fetch(`${API}/api/learning/books`).then((r) => {
      if (!r.ok) throw new Error(`List books failed: ${r.status}`);
      return r.json();
    }),

  getBookPage: (bookId: string, pageNum: number): Promise<BookPage> =>
    fetch(`${API}/api/learning/books/${bookId}/page/${pageNum}`).then((r) => {
      if (!r.ok) throw new Error(`Get page failed: ${r.status}`);
      return r.json();
    }),

  summarizeBookPage: (bookId: string, pageNum: number): Promise<{ summary: string; cached: boolean }> =>
    fetch(`${API}/api/learning/books/${bookId}/page/${pageNum}/summary`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Summarize page failed: ${r.status}`);
      return r.json();
    }),

  bookChat: (bookId: string, pageNum: number, message: string): Promise<{ response: string }> =>
    fetch(
      `${API}/api/learning/books/${bookId}/chat?page_num=${pageNum}&message=${encodeURIComponent(message)}`,
      { method: 'POST' }
    ).then((r) => {
      if (!r.ok) throw new Error(`Book chat failed: ${r.status}`);
      return r.json();
    }),

  resume: (): Promise<Record<string, unknown>> =>
    fetch(`${API}/api/resume`).then((r) => {
      if (!r.ok) throw new Error(`Resume fetch failed: ${r.status}`);
      return r.json();
    }),

  saveResume: (data: Record<string, unknown>): Promise<{ ok: boolean }> =>
    fetch(`${API}/api/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then((r) => {
      if (!r.ok) throw new Error(`Resume save failed: ${r.status}`);
      return r.json();
    }),

  statsTimeline: (): Promise<{ timeline: { date: string; found: number; applied: number }[] }> =>
    fetch(`${API}/api/stats/timeline`).then((r) => {
      if (!r.ok) throw new Error(`Timeline failed: ${r.status}`);
      return r.json();
    }),

  salaryStats: async (): Promise<{
    ranges: { label: string; count: number }[];
    avg_mentioned: number;
    jobs_with_salary: number;
  }> => {
    const r = await fetch(`${API}/api/jobs?per_page=500`);
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
    fetch(`${API}/api/followups`).then((r) => {
      if (!r.ok) throw new Error(`Followups failed: ${r.status}`);
      return r.json();
    }),

  userProfile: (): Promise<Record<string, unknown>> =>
    fetch(`${API}/api/user/profile`).then((r) => {
      if (!r.ok) throw new Error(`Profile failed: ${r.status}`);
      return r.json();
    }),

  saveProfile: (data: Record<string, unknown>): Promise<{ ok: boolean }> =>
    fetch(`${API}/api/user/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then((r) => {
      if (!r.ok) throw new Error(`Profile save failed: ${r.status}`);
      return r.json();
    }),

  updateStatus: (id: string, status: string): Promise<{ ok: boolean }> =>
    fetch(`${API}/api/update/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).then((r) => {
      if (!r.ok) throw new Error(`Update status failed: ${r.status}`);
      return r.json();
    }),

  bulkAction: (action: string, ids: string[], value?: string): Promise<{ updated: number }> =>
    fetch(`${API}/api/jobs/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids, value }),
    }).then((r) => r.json()),

  cvContent: (jobId: string): Promise<{ content: string | null }> =>
    fetch(`${API}/api/files/cv/${jobId}/content`).then((r) => r.json()),

  getInterviews: (jobId: string): Promise<{ rounds: InterviewRound[] }> =>
    fetch(`${API}/api/interview/${jobId}`).then((r) => r.json()),

  addInterview: (
    jobId: string,
    data: { round_type: string; scheduled_at?: string; notes?: string }
  ): Promise<InterviewRound> =>
    fetch(`${API}/api/interview/${jobId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  updateInterview: (
    roundId: string,
    data: { result?: string; notes?: string; scheduled_at?: string }
  ): Promise<InterviewRound> =>
    fetch(`${API}/api/interview/round/${roundId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  blacklistCompany: (jobId: string): Promise<{ blacklisted: boolean; company: string }> =>
    fetch(`${API}/api/jobs/${jobId}/blacklist`, { method: 'POST' }).then((r) => r.json()),
};
