import type {
  AwsStatusResponse,
  DashboardResponse,
  LessonStatus,
  SettingsResponse,
  SettingsUpdate,
  TopicDetailResponse,
  TopicGroup,
  TopicLessonsResponse,
  TopicRecordsResponse,
  TopicReferenceResponse,
  TopicReviewResponse,
  TopicSummary,
  TopicsResponse
} from "@learning-hub/shared";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  createTopicGroup,
  deleteLesson,
  deleteTopic,
  fetchDashboard,
  fetchAwsStatus,
  fetchSettings,
  fetchTopicDetail,
  fetchTopicLessons,
  fetchTopicRecords,
  fetchTopicReference,
  fetchTopicReview,
  fetchTopics,
  generateTopicQuiz,
  runAwsLogin,
  saveSettings,
  streamTopicLessonGeneration,
  updateLessonDueDate,
  updateLessonTitle,
  updateLessonStatus,
  updateTopicGroup,
  updateTopicGroupAssignment,
  updateTopicTitle
} from "./api.js";
import { InlineNotice, PageSkeleton } from "./components/ui.js";
import {
  browserMobileNavigationOpen,
  browserPath,
  chatErrorText,
  localId,
  parseRoute,
  routeSlug,
  topicPath,
  type ArtifactCreatedEvent,
  type AwsLoginStatus,
  type LessonGenerationState,
  type Route
} from "./lib.js";
import { CommandPalette } from "./shell/CommandPalette.js";
import { MobileSidebarSheet, MobileTopBar, Sidebar } from "./shell/Sidebar.js";
import { TopBar } from "./shell/TopBar.js";
import { Dashboard } from "./pages/Dashboard.js";
import { LessonListPage } from "./pages/Lessons.js";
import { LessonViewPage } from "./pages/LessonView.js";
import { NewTopicWizard } from "./pages/NewTopic.js";
import { RecordsPage } from "./pages/Records.js";
import { ResourcesPage } from "./pages/Resources.js";
import { ReviewPage } from "./pages/Review.js";
import { SettingsPage } from "./pages/Settings.js";
import { TopicHome } from "./pages/TopicHome.js";

interface AppProps {
  initialDashboard?: DashboardResponse;
  initialAwsStatus?: AwsStatusResponse;
  initialMobileNavigationOpen?: boolean;
  initialPath?: string;
  initialSettings?: SettingsResponse;
  initialTopicDetails?: Record<number, TopicDetailResponse>;
  initialTopicLessons?: Record<number, TopicLessonsResponse>;
  initialTopicRecords?: Record<number, TopicRecordsResponse>;
  initialTopicReference?: Record<number, TopicReferenceResponse>;
  initialTopicReview?: Record<number, TopicReviewResponse>;
  initialTopics?: TopicsResponse;
}

const idleLessonGeneration: LessonGenerationState = {
  activities: [],
  needsModelSettings: false,
  status: "idle"
};

interface LessonGenerationOptions {
  openWhenReady?: boolean;
  topicSlug?: string;
}

interface TopicCreatedOptions {
  generateFirstLesson?: boolean;
}

function Content({
  awsLoginMessage,
  awsLoginStatus,
  awsStatus,
  contentError,
  contentLoading,
  dashboard,
  detail,
  lessonGeneration,
  lessons,
  loadError,
  onArtifactCreated,
  onAwsLogin,
  onDeleteLesson,
  onDeleteTopic,
  onGenerateLesson,
  onLessonDueDateChange,
  onGenerateQuiz,
  onLessonTitleChange,
  onSaveSettings,
  onStatusChange,
  onTopicTitleChange,
  onTopicCreated,
  records,
  reference,
  review,
  route,
  saveStatus,
  settings,
  topic,
  topicReviewCache,
  topics,
  topicsLoading
}: {
  awsLoginMessage?: string;
  awsLoginStatus: AwsLoginStatus;
  awsStatus?: AwsStatusResponse;
  contentError?: string;
  contentLoading: boolean;
  dashboard?: DashboardResponse;
  detail?: TopicDetailResponse;
  lessonGeneration: LessonGenerationState;
  lessons?: TopicLessonsResponse;
  loadError?: string;
  onArtifactCreated: (topicId: number, event: ArtifactCreatedEvent) => void;
  onAwsLogin: () => void;
  onDeleteLesson: (topicId: number, lessonNumber: number) => Promise<void>;
  onDeleteTopic: (topicId: number, slug: string) => Promise<void>;
  onGenerateLesson: (topicId: number, options?: LessonGenerationOptions) => void;
  onLessonDueDateChange: (
    topicId: number,
    lessonNumber: number,
    dueAt: string | null
  ) => Promise<void>;
  onGenerateQuiz: (topicId: number, lessonId?: number) => void;
  onLessonTitleChange: (topicId: number, lessonNumber: number, title: string) => Promise<void>;
  onSaveSettings: (update: SettingsUpdate) => void;
  onStatusChange: (topicId: number, lessonNumber: number, status: LessonStatus) => void;
  onTopicTitleChange: (topicId: number, title: string) => Promise<void>;
  onTopicCreated: (
    topicsResponse: TopicsResponse,
    slug: string,
    options?: TopicCreatedOptions
  ) => void;
  records?: TopicRecordsResponse;
  reference?: TopicReferenceResponse;
  review?: TopicReviewResponse;
  route: Route;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  settings?: SettingsResponse;
  topic?: TopicSummary;
  topicReviewCache: Record<number, TopicReviewResponse>;
  topics?: TopicsResponse;
  topicsLoading: boolean;
}) {
  if (contentError && route.name !== "dashboard" && route.name !== "settings") {
    return <InlineNotice tone="error" title="Topic API unavailable" body={contentError} />;
  }

  if (routeSlug(route) && !topic && topicsLoading) {
    return <PageSkeleton />;
  }

  if (route.name === "settings") {
    return (
      <SettingsPage
        awsLoginMessage={awsLoginMessage}
        awsLoginStatus={awsLoginStatus}
        awsStatus={awsStatus}
        onAwsLogin={onAwsLogin}
        onSaveSettings={onSaveSettings}
        saveStatus={saveStatus}
        settings={settings}
      />
    );
  }

  if (route.name === "topic") {
    return (
      <TopicHome
        awsStatus={awsStatus}
        detail={detail}
        lessonGeneration={lessonGeneration}
        lessons={lessons}
        loading={contentLoading}
        onGenerateLesson={onGenerateLesson}
        onStatusChange={onStatusChange}
        onTopicTitleChange={onTopicTitleChange}
        route={route}
        topic={topic}
      />
    );
  }

  if (route.name === "topic-lessons") {
    return (
      <LessonListPage
        lessons={lessons}
        loading={contentLoading}
        onDeleteLesson={onDeleteLesson}
        onLessonDueDateChange={onLessonDueDateChange}
        onLessonTitleChange={onLessonTitleChange}
        onStatusChange={onStatusChange}
        onTopicTitleChange={onTopicTitleChange}
        route={route}
        topic={topic}
      />
    );
  }

  if (route.name === "topic-lesson") {
    return (
      <LessonViewPage
        lessonNumber={route.lessonNumber}
        lessons={lessons}
        loading={contentLoading}
        onArtifactCreated={(event) => {
          if (topic) {
            onArtifactCreated(topic.id, event);
          }
        }}
        onDeleteLesson={onDeleteLesson}
        onLessonDueDateChange={onLessonDueDateChange}
        onGenerateQuiz={onGenerateQuiz}
        onStatusChange={onStatusChange}
        onTopicTitleChange={onTopicTitleChange}
        route={route}
        topic={topic}
      />
    );
  }

  if (route.name === "topic-records") {
    return (
      <RecordsPage
        loading={contentLoading}
        onTopicTitleChange={onTopicTitleChange}
        records={records}
        route={route}
        topic={topic}
      />
    );
  }

  if (route.name === "topic-resources") {
    return (
      <ResourcesPage
        loading={contentLoading}
        onTopicTitleChange={onTopicTitleChange}
        reference={reference}
        route={route}
        topic={topic}
      />
    );
  }

  if (route.name === "topic-review") {
    return (
      <ReviewPage
        loading={contentLoading}
        onTopicTitleChange={onTopicTitleChange}
        review={review}
        route={route}
        topic={topic}
      />
    );
  }

  if (route.name === "new-topic") {
    return <NewTopicWizard onCreated={onTopicCreated} />;
  }

  if (route.name === "not-found") {
    return (
      <InlineNotice
        tone="error"
        title="Page not found"
        body="The requested route is not available."
      />
    );
  }

  return (
    <Dashboard
      awsLoginMessage={awsLoginMessage}
      awsLoginStatus={awsLoginStatus}
      awsStatus={awsStatus}
      dashboard={dashboard}
      loadError={loadError}
      onAwsLogin={onAwsLogin}
      onDeleteTopic={onDeleteTopic}
      settings={settings}
      topicReviewCache={topicReviewCache}
      topics={topics}
      topicsLoading={topicsLoading}
    />
  );
}

function withoutTopicCacheEntry<T>(current: Record<number, T>, topicId: number) {
  const next = { ...current };
  delete next[topicId];
  return next;
}

function updateTopicGeneration(
  topicId: number,
  updater: (current: LessonGenerationState) => LessonGenerationState,
  setLessonGenerations: Dispatch<SetStateAction<Record<number, LessonGenerationState>>>
) {
  setLessonGenerations((current) => ({
    ...current,
    [topicId]: updater(current[topicId] ?? idleLessonGeneration)
  }));
}

export function App({
  initialDashboard,
  initialAwsStatus,
  initialMobileNavigationOpen,
  initialPath,
  initialSettings,
  initialTopicDetails,
  initialTopicLessons,
  initialTopicRecords,
  initialTopicReference,
  initialTopicReview,
  initialTopics
}: AppProps) {
  const [path, setPath] = useState(initialPath ?? browserPath());
  const [dashboard, setDashboard] = useState<DashboardResponse | undefined>(initialDashboard);
  const [topics, setTopics] = useState<TopicsResponse | undefined>(initialTopics);
  const [settings, setSettings] = useState<SettingsResponse | undefined>(initialSettings);
  const [awsStatus, setAwsStatus] = useState<AwsStatusResponse | undefined>(initialAwsStatus);
  const [topicDetails, setTopicDetails] = useState<Record<number, TopicDetailResponse>>(
    initialTopicDetails ?? {}
  );
  const [topicLessons, setTopicLessons] = useState<Record<number, TopicLessonsResponse>>(
    initialTopicLessons ?? {}
  );
  const [topicRecords, setTopicRecords] = useState<Record<number, TopicRecordsResponse>>(
    initialTopicRecords ?? {}
  );
  const [topicReference, setTopicReference] = useState<Record<number, TopicReferenceResponse>>(
    initialTopicReference ?? {}
  );
  const [topicReview, setTopicReview] = useState<Record<number, TopicReviewResponse>>(
    initialTopicReview ?? {}
  );
  const [topicsLoading, setTopicsLoading] = useState(!initialTopics);
  const [contentLoading, setContentLoading] = useState(false);
  const [awsLoginStatus, setAwsLoginStatus] = useState<AwsLoginStatus>("idle");
  const [awsLoginMessage, setAwsLoginMessage] = useState<string | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [contentError, setContentError] = useState<string | undefined>();
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(
    initialMobileNavigationOpen ?? browserMobileNavigationOpen()
  );
  const [lessonGenerations, setLessonGenerations] = useState<
    Record<number, LessonGenerationState>
  >({});
  const lessonGenerationRunIds = useRef<Record<number, number>>({});
  const lessonGenerationAbortControllers = useRef<Record<number, AbortController | undefined>>({});
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  const route = useMemo(() => parseRoute(path), [path]);
  const activeSlug = routeSlug(route);
  const activeTopic = useMemo(
    () => topics?.topics.find((topic) => topic.slug === activeSlug),
    [activeSlug, topics]
  );
  const activeTopicId = activeTopic?.id;
  const activeDetail = activeTopicId ? topicDetails[activeTopicId] : undefined;
  const activeLessons = activeTopicId ? topicLessons[activeTopicId] : undefined;
  const activeRecords = activeTopicId ? topicRecords[activeTopicId] : undefined;
  const activeReference = activeTopicId ? topicReference[activeTopicId] : undefined;
  const activeReview = activeTopicId ? topicReview[activeTopicId] : undefined;
  const activeLessonGeneration = activeTopicId
    ? lessonGenerations[activeTopicId] ?? idleLessonGeneration
    : idleLessonGeneration;

  const navigate = useCallback((nextPath: string) => {
    if (typeof window !== "undefined") {
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (currentPath !== nextPath) {
        window.history.pushState({}, "", nextPath);
      }
    }

    setPath(nextPath);
    setCommandOpen(false);
    setMobileNavigationOpen(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const onPopState = () => setPath(browserPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }

      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement)) {
        return;
      }

      if (
        target.target ||
        target.hasAttribute("download") ||
        target.getAttribute("rel") === "external"
      ) {
        return;
      }

      const url = new URL(target.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) {
        return;
      }

      event.preventDefault();
      navigate(`${url.pathname}${url.search}${url.hash}`);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [navigate]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    let cancelled = false;

    async function loadShell() {
      setTopicsLoading(true);
      setLoadError(undefined);

      try {
        const [nextTopics, nextSettings, nextAwsStatus, nextDashboard] = await Promise.all([
          fetchTopics(),
          fetchSettings(),
          fetchAwsStatus(),
          fetchDashboard()
        ]);

        if (!cancelled) {
          setTopics(nextTopics);
          setSettings(nextSettings);
          setAwsStatus(nextAwsStatus);
          setDashboard(nextDashboard);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "The API could not be reached.");
        }
      } finally {
        if (!cancelled) {
          setTopicsLoading(false);
        }
      }
    }

    void loadShell();

    const refreshAws = () => {
      void fetchAwsStatus()
        .then((nextStatus) => {
          if (!cancelled) {
            setAwsStatus(nextStatus);
          }
        })
        .catch(() => undefined);
    };

    window.addEventListener("focus", refreshAws);
    const awsStatusInterval = window.setInterval(refreshAws, 60000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshAws);
      window.clearInterval(awsStatusInterval);
    };
  }, []);

  useEffect(() => {
    if (!activeTopicId) {
      return undefined;
    }

    const topicId = activeTopicId;
    let cancelled = false;

    async function loadTopic() {
      setContentLoading(true);
      setContentError(undefined);

      try {
        const detailPromise = fetchTopicDetail(topicId);
        const lessonPromise =
          route.name === "topic" || route.name === "topic-lessons" || route.name === "topic-lesson"
            ? fetchTopicLessons(topicId)
            : Promise.resolve(undefined);
        const recordsPromise =
          route.name === "topic-records" ? fetchTopicRecords(topicId) : Promise.resolve(undefined);
        const referencePromise =
          route.name === "topic-resources"
            ? fetchTopicReference(topicId)
            : Promise.resolve(undefined);
        const reviewPromise =
          route.name === "topic-review" ? fetchTopicReview(topicId) : Promise.resolve(undefined);

        const [nextDetail, nextLessons, nextRecords, nextReference, nextReview] = await Promise.all(
          [detailPromise, lessonPromise, recordsPromise, referencePromise, reviewPromise]
        );

        if (!cancelled) {
          setTopicDetails((current) => ({ ...current, [topicId]: nextDetail }));

          if (nextLessons) {
            setTopicLessons((current) => ({ ...current, [topicId]: nextLessons }));
          }

          if (nextRecords) {
            setTopicRecords((current) => ({ ...current, [topicId]: nextRecords }));
          }

          if (nextReference) {
            setTopicReference((current) => ({ ...current, [topicId]: nextReference }));
          }

          if (nextReview) {
            setTopicReview((current) => ({ ...current, [topicId]: nextReview }));
          }
        }
      } catch (error) {
        if (!cancelled) {
          setContentError(
            error instanceof Error ? error.message : "The topic API could not be reached."
          );
        }
      } finally {
        if (!cancelled) {
          setContentLoading(false);
        }
      }
    }

    void loadTopic();

    return () => {
      cancelled = true;
    };
  }, [activeTopicId, route.name]);

  useEffect(() => {
    if (route.name !== "dashboard" || !topics?.topics.length) {
      return undefined;
    }

    const dueTopics = topics.topics.filter(
      (topic) => topic.dueReviewCount > 0 && !topicReview[topic.id]
    );
    if (!dueTopics.length) {
      return undefined;
    }

    let cancelled = false;

    async function loadDashboardReviews() {
      const loaded = await Promise.all(
        dueTopics.map(async (topic) => [topic.id, await fetchTopicReview(topic.id)] as const)
      );

      if (!cancelled && loaded.length) {
        setTopicReview((current) => ({
          ...current,
          ...Object.fromEntries(loaded)
        }));
      }
    }

    void loadDashboardReviews().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [route.name, topicReview, topics]);

  useEffect(() => {
    if (!commandOpen || !topics?.topics.length) {
      return undefined;
    }

    const availableTopics = topics.topics;
    let cancelled = false;

    async function loadPaletteLessons() {
      const unloadedTopics = availableTopics.filter((topic) => !topicLessons[topic.id]);
      const loaded = await Promise.all(
        unloadedTopics.map(async (topic) => [topic.id, await fetchTopicLessons(topic.id)] as const)
      );

      if (!cancelled && loaded.length) {
        setTopicLessons((current) => ({
          ...current,
          ...Object.fromEntries(loaded)
        }));
      }
    }

    void loadPaletteLessons().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [commandOpen, topics, topicLessons]);

  const handleAwsLogin = () => {
    setAwsLoginStatus("running");
    setAwsLoginMessage(undefined);

    void runAwsLogin()
      .then(async (login) => {
        setAwsLoginStatus(login.ok ? "succeeded" : "failed");
        setAwsLoginMessage(login.message);

        const nextStatus = await fetchAwsStatus();
        setAwsStatus(nextStatus);
      })
      .catch((error) => {
        setAwsLoginStatus("failed");
        setAwsLoginMessage(
          error instanceof Error ? error.message : "AWS login command could not be started."
        );
      });
  };

  const handleSaveSettings = (update: SettingsUpdate) => {
    setSettingsSaveStatus("saving");

    void saveSettings(update)
      .then((nextSettings) => {
        setSettings(nextSettings);
        setSettingsSaveStatus("saved");
      })
      .catch(() => setSettingsSaveStatus("error"));
  };

  const applyLessonUpdate = (
    topicId: number,
    updatedLesson: TopicLessonsResponse["lessons"][number]
  ) => {
    setTopicLessons((current) => {
      const currentLessons = current[topicId];
      if (!currentLessons) {
        return current;
      }

      return {
        ...current,
        [topicId]: {
          ...currentLessons,
          lessons: currentLessons.lessons.map((lesson) =>
            lesson.number === updatedLesson.number ? updatedLesson : lesson
          )
        }
      };
    });
  };

  const applyTopicUpdate = (updatedTopic: TopicSummary) => {
    setTopics((current) =>
      current
        ? {
            ...current,
            topics: current.topics.map((topic) =>
              topic.id === updatedTopic.id ? updatedTopic : topic
            )
          }
        : current
    );
    setDashboard((current) =>
      current
        ? {
            ...current,
            topics: current.topics.map((topic) =>
              topic.id === updatedTopic.id ? updatedTopic : topic
            )
          }
        : current
    );
    setTopicDetails((current) => {
      const detail = current[updatedTopic.id];

      if (!detail) {
        return current;
      }

      return {
        ...current,
        [updatedTopic.id]: {
          ...detail,
          topic: updatedTopic
        }
      };
    });
  };

  const applyTopicGroupUpdate = (updatedGroup: TopicGroup) => {
    setTopics((current) => {
      if (!current) {
        return current;
      }

      const existing = current.groups.some((group) => group.id === updatedGroup.id);
      return {
        ...current,
        groups: existing
          ? current.groups.map((group) => (group.id === updatedGroup.id ? updatedGroup : group))
          : [...current.groups, updatedGroup].sort((a, b) => a.name.localeCompare(b.name))
      };
    });
  };

  const refreshLessonSurfaces = async (topicId: number) => {
    const [nextTopics, nextDetail, nextLessons, nextDashboard] = await Promise.all([
      fetchTopics(),
      fetchTopicDetail(topicId),
      fetchTopicLessons(topicId),
      fetchDashboard()
    ]);

    setTopics(nextTopics);
    setTopicDetails((current) => ({ ...current, [topicId]: nextDetail }));
    setTopicLessons((current) => ({ ...current, [topicId]: nextLessons }));
    setDashboard(nextDashboard);
  };

  const handleCreateTopicGroup = async (name: string) => {
    try {
      const response = await createTopicGroup({ name });
      applyTopicGroupUpdate(response.group);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Topic group could not be created.";
      setContentError(message);
      throw error;
    }
  };

  const handleTopicGroupCollapseChange = async (groupId: number, collapsed: boolean) => {
    try {
      const response = await updateTopicGroup(groupId, { collapsed });
      applyTopicGroupUpdate(response.group);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Topic group could not be updated.";
      setContentError(message);
      throw error;
    }
  };

  const handleTopicGroupChange = async (topicId: number, groupId: number | null) => {
    try {
      const response = await updateTopicGroupAssignment(topicId, { groupId });
      applyTopicUpdate(response.topic);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Topic group could not be saved.";
      setContentError(message);
      throw error;
    }
  };

  const handleTopicTitleChange = async (topicId: number, title: string) => {
    try {
      const response = await updateTopicTitle(topicId, { title });
      applyTopicUpdate(response.topic);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Topic title could not be saved.";
      setContentError(message);
      throw error;
    }
  };

  const handleLessonTitleChange = async (topicId: number, lessonNumber: number, title: string) => {
    try {
      const response = await updateLessonTitle(topicId, lessonNumber, { title });
      applyLessonUpdate(topicId, response.lesson);
      await refreshLessonSurfaces(topicId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Lesson title could not be saved.";
      setContentError(message);
      throw error;
    }
  };

  const handleLessonDueDateChange = async (
    topicId: number,
    lessonNumber: number,
    dueAt: string | null
  ) => {
    try {
      const response = await updateLessonDueDate(topicId, lessonNumber, { dueAt });
      applyLessonUpdate(topicId, response.lesson);

      const [nextTopics, nextDetail, nextDashboard] = await Promise.all([
        fetchTopics(),
        fetchTopicDetail(topicId),
        fetchDashboard()
      ]);

      setTopics(nextTopics);
      setTopicDetails((current) => ({ ...current, [topicId]: nextDetail }));
      setDashboard(nextDashboard);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Lesson due date could not be saved.";
      setContentError(message);
      throw error;
    }
  };

  const handleDeleteLesson = async (topicId: number, lessonNumber: number) => {
    try {
      await deleteLesson(topicId, lessonNumber);
      await refreshLessonSurfaces(topicId);

      if (route.name === "topic-lesson" && route.lessonNumber === lessonNumber && activeTopic) {
        navigate(topicPath(activeTopic, "lessons"));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Lesson could not be deleted.";
      setContentError(message);
      throw error;
    }
  };

  const handleDeleteTopic = async (topicId: number, slug: string) => {
    let deletedSlug = slug;

    try {
      const response = await deleteTopic(topicId);
      deletedSlug = response.slug;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Topic could not be deleted.";
      setContentError(message);
      throw error;
    }

    setTopics((current) =>
      current
        ? {
            ...current,
            topics: current.topics.filter((topic) => topic.id !== topicId)
          }
        : current
    );
    setDashboard((current) =>
      current
        ? {
            ...current,
            topics: current.topics.filter((topic) => topic.id !== topicId)
          }
        : current
    );
    setTopicDetails((current) => withoutTopicCacheEntry(current, topicId));
    setTopicLessons((current) => withoutTopicCacheEntry(current, topicId));
    setTopicRecords((current) => withoutTopicCacheEntry(current, topicId));
    setTopicReference((current) => withoutTopicCacheEntry(current, topicId));
    setTopicReview((current) => withoutTopicCacheEntry(current, topicId));
    lessonGenerationRunIds.current[topicId] = (lessonGenerationRunIds.current[topicId] ?? 0) + 1;
    lessonGenerationAbortControllers.current[topicId]?.abort();
    delete lessonGenerationAbortControllers.current[topicId];
    setLessonGenerations((current) => withoutTopicCacheEntry(current, topicId));

    if (activeSlug === deletedSlug) {
      navigate("/");
    }

    try {
      const [nextTopics, nextDashboard] = await Promise.all([fetchTopics(), fetchDashboard()]);
      setTopics(nextTopics);
      setDashboard(nextDashboard);
      setContentError(undefined);
    } catch (error) {
      setContentError(
        error instanceof Error
          ? `Topic was deleted, but the workspace refresh failed: ${error.message}`
          : "Topic was deleted, but the workspace refresh failed."
      );
    }
  };

  const handleStatusChange = (topicId: number, lessonNumber: number, status: LessonStatus) => {
    void updateLessonStatus(topicId, lessonNumber, status)
      .then(async (response) => {
        applyLessonUpdate(topicId, response.lesson);

        const [nextTopics, nextDetail, nextDashboard] = await Promise.all([
          fetchTopics(),
          fetchTopicDetail(topicId),
          fetchDashboard()
        ]);
        setTopics(nextTopics);
        setTopicDetails((current) => ({ ...current, [topicId]: nextDetail }));
        setDashboard(nextDashboard);
      })
      .catch((error) => {
        setContentError(
          error instanceof Error ? error.message : "Lesson status could not be saved."
        );
      });
  };

  const handleArtifactCreated = (topicId: number, event: ArtifactCreatedEvent) => {
    void fetchTopics()
      .then((nextTopics) => setTopics(nextTopics))
      .catch(() => undefined);
    void fetchDashboard()
      .then((nextDashboard) => setDashboard(nextDashboard))
      .catch(() => undefined);
    void fetchTopicDetail(topicId)
      .then((nextDetail) => setTopicDetails((current) => ({ ...current, [topicId]: nextDetail })))
      .catch(() => undefined);

    if (event.kind === "lesson") {
      void fetchTopicLessons(topicId)
        .then((nextLessons) =>
          setTopicLessons((current) => ({ ...current, [topicId]: nextLessons }))
        )
        .catch(() => undefined);
    }

    if (event.kind === "record") {
      void fetchTopicRecords(topicId)
        .then((nextRecords) =>
          setTopicRecords((current) => ({ ...current, [topicId]: nextRecords }))
        )
        .catch(() => undefined);
    }

    if (event.kind === "reference") {
      void fetchTopicReference(topicId)
        .then((nextReference) =>
          setTopicReference((current) => ({ ...current, [topicId]: nextReference }))
        )
        .catch(() => undefined);
    }
  };

  const handleGenerateLesson = (topicId: number, options: LessonGenerationOptions = {}) => {
    if (lessonGenerations[topicId]?.status === "streaming") {
      return;
    }

    lessonGenerationAbortControllers.current[topicId]?.abort();

    const runId = (lessonGenerationRunIds.current[topicId] ?? 0) + 1;
    const activeToolIds = new Map<string, string>();
    const abortController = new AbortController();
    let generatedLessonRef: string | undefined;

    lessonGenerationRunIds.current[topicId] = runId;
    lessonGenerationAbortControllers.current[topicId] = abortController;

    const shouldIgnoreStreamUpdate = () =>
      lessonGenerationRunIds.current[topicId] !== runId || abortController.signal.aborted;

    updateTopicGeneration(
      topicId,
      () => ({
        activities: [],
        needsModelSettings: false,
        status: "streaming"
      }),
      setLessonGenerations
    );

    void streamTopicLessonGeneration(topicId, (streamEvent) => {
      if (shouldIgnoreStreamUpdate()) {
        return;
      }

      if (streamEvent.type === "tool_started") {
        const activityId = localId(streamEvent.name);
        activeToolIds.set(streamEvent.name, activityId);
        updateTopicGeneration(
          topicId,
          (current) => ({
            ...current,
            activities: [
              ...current.activities,
              {
                id: activityId,
                label: streamEvent.label,
                name: streamEvent.name,
                status: "running"
              }
            ]
          }),
          setLessonGenerations
        );
        return;
      }

      if (streamEvent.type === "tool_finished") {
        const activityId = activeToolIds.get(streamEvent.name);
        updateTopicGeneration(
          topicId,
          (current) => ({
            ...current,
            activities: activityId
              ? current.activities.map((activity) =>
                  activity.id === activityId ? { ...activity, status: "finished" } : activity
                )
              : [
                  ...current.activities,
                  {
                    id: localId(streamEvent.name),
                    label: streamEvent.label,
                    name: streamEvent.name,
                    status: "finished"
                  }
                ]
          }),
          setLessonGenerations
        );
        return;
      }

      if (streamEvent.type === "artifact_created") {
        if (streamEvent.kind === "lesson") {
          generatedLessonRef = streamEvent.ref;
        }

        handleArtifactCreated(topicId, streamEvent);
        updateTopicGeneration(
          topicId,
          (current) => ({
            ...current,
            activities: [
              ...current.activities,
              {
                id: localId(streamEvent.kind),
                label: `${streamEvent.kind} ${streamEvent.ref}`,
                name: streamEvent.kind,
                status: "finished"
              }
            ],
            generatedLessonRef:
              streamEvent.kind === "lesson" ? streamEvent.ref : current.generatedLessonRef
          }),
          setLessonGenerations
        );
        return;
      }

      if (streamEvent.type === "error") {
        updateTopicGeneration(
          topicId,
          (current) => ({
            ...current,
            error: chatErrorText(streamEvent),
            needsModelSettings:
              streamEvent.code === "provider_config" &&
              streamEvent.message === "Bedrock Converse model is not configured.",
            status: "error"
          }),
          setLessonGenerations
        );
        return;
      }

      if (streamEvent.type === "done") {
        updateTopicGeneration(
          topicId,
          (current) => ({
            ...current,
            status: "done"
          }),
          setLessonGenerations
        );

        if (options.openWhenReady && generatedLessonRef) {
          const topicSlug =
            options.topicSlug ?? topics?.topics.find((topic) => topic.id === topicId)?.slug;

          if (topicSlug) {
            void fetchTopicLessons(topicId)
              .then((nextLessons) => {
                setTopicLessons((current) => ({ ...current, [topicId]: nextLessons }));

                const generatedLesson = nextLessons.lessons.find(
                  (lesson) => lesson.fileName === generatedLessonRef
                );
                if (generatedLesson) {
                  navigate(`/t/${encodeURIComponent(topicSlug)}/lessons/${generatedLesson.number}`);
                }
              })
              .catch(() => undefined);
          }
        }
      }
    }, { signal: abortController.signal })
      .catch((error) => {
        if (shouldIgnoreStreamUpdate() || (error instanceof Error && error.name === "AbortError")) {
          return;
        }

        updateTopicGeneration(
          topicId,
          (current) => ({
            ...current,
            error: error instanceof Error ? error.message : "Lesson generation failed.",
            needsModelSettings: false,
            status: "error"
          }),
          setLessonGenerations
        );
      })
      .finally(() => {
        if (lessonGenerationRunIds.current[topicId] === runId) {
          delete lessonGenerationAbortControllers.current[topicId];
        }
      });
  };

  const handleTopicCreated = (
    nextTopics: TopicsResponse,
    slug: string,
    options: TopicCreatedOptions = {}
  ) => {
    setTopics(nextTopics);
    void fetchDashboard()
      .then((nextDashboard) => setDashboard(nextDashboard))
      .catch(() => undefined);

    const createdTopic = nextTopics.topics.find((topic) => topic.slug === slug);
    navigate(`/t/${encodeURIComponent(slug)}`);

    if (options.generateFirstLesson && createdTopic) {
      handleGenerateLesson(createdTopic.id, {
        openWhenReady: true,
        topicSlug: slug
      });
    }
  };

  const handleGenerateQuiz = (topicId: number, lessonId?: number) => {
    const topicSlug = topics?.topics.find((topic) => topic.id === topicId)?.slug;

    void generateTopicQuiz(topicId, lessonId ? { lessonId } : {})
      .then(async () => {
        const [nextTopics, nextDetail, nextReview, nextDashboard] = await Promise.all([
          fetchTopics(),
          fetchTopicDetail(topicId),
          fetchTopicReview(topicId),
          fetchDashboard()
        ]);

        setTopics(nextTopics);
        setTopicDetails((current) => ({ ...current, [topicId]: nextDetail }));
        setTopicReview((current) => ({ ...current, [topicId]: nextReview }));
        setDashboard(nextDashboard);
        if (topicSlug) {
          navigate(`/t/${encodeURIComponent(topicSlug)}/review`);
        }
      })
      .catch((error) => {
        setContentError(error instanceof Error ? error.message : "Quiz could not be generated.");
      });
  };

  return (
    <main className="min-h-dvh w-full max-w-full overflow-x-hidden bg-background text-foreground">
      <div className="grid min-h-dvh w-full max-w-full grid-cols-1 overflow-x-hidden lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="hidden min-h-dvh lg:block">
          <Sidebar
            awsStatus={awsStatus}
            onCommandOpen={() => setCommandOpen(true)}
            onCreateTopicGroup={handleCreateTopicGroup}
            onDeleteTopic={handleDeleteTopic}
            onTopicGroupChange={handleTopicGroupChange}
            onTopicGroupCollapseChange={handleTopicGroupCollapseChange}
            onTopicTitleChange={handleTopicTitleChange}
            route={route}
            topics={topics}
            topicsLoading={topicsLoading}
          />
        </div>
        <div className="workspace-canvas min-w-0">
          <MobileTopBar
            awsStatus={awsStatus}
            onMenuOpen={() => setMobileNavigationOpen(true)}
            open={mobileNavigationOpen}
          />
          <TopBar
            awsStatus={awsStatus}
            onCommandOpen={() => setCommandOpen(true)}
            route={route}
            topic={activeTopic}
            topics={topics}
          />
          <section className="w-full min-w-0 max-w-full overflow-hidden px-4 py-5 sm:px-5 lg:px-7 lg:py-7">
            <Content
              awsLoginMessage={awsLoginMessage}
              awsLoginStatus={awsLoginStatus}
              awsStatus={awsStatus}
              contentError={contentError}
              contentLoading={contentLoading}
              dashboard={dashboard}
              detail={activeDetail}
              lessonGeneration={activeLessonGeneration}
              lessons={activeLessons}
              loadError={loadError}
              onArtifactCreated={handleArtifactCreated}
              onAwsLogin={handleAwsLogin}
              onDeleteLesson={handleDeleteLesson}
              onDeleteTopic={handleDeleteTopic}
              onGenerateLesson={handleGenerateLesson}
              onLessonDueDateChange={handleLessonDueDateChange}
              onGenerateQuiz={handleGenerateQuiz}
              onLessonTitleChange={handleLessonTitleChange}
              onSaveSettings={handleSaveSettings}
              onStatusChange={handleStatusChange}
              onTopicCreated={handleTopicCreated}
              onTopicTitleChange={handleTopicTitleChange}
              records={activeRecords}
              reference={activeReference}
              review={activeReview}
              route={route}
              saveStatus={settingsSaveStatus}
              settings={settings}
              topic={activeTopic}
              topicReviewCache={topicReview}
              topics={topics}
              topicsLoading={topicsLoading}
            />
          </section>
        </div>
      </div>
      <MobileSidebarSheet
        awsStatus={awsStatus}
        onClose={() => setMobileNavigationOpen(false)}
        onCommandOpen={() => {
          setMobileNavigationOpen(false);
          setCommandOpen(true);
        }}
        onCreateTopicGroup={handleCreateTopicGroup}
        onDeleteTopic={handleDeleteTopic}
        open={mobileNavigationOpen}
        onTopicGroupChange={handleTopicGroupChange}
        onTopicGroupCollapseChange={handleTopicGroupCollapseChange}
        onTopicTitleChange={handleTopicTitleChange}
        route={route}
        topics={topics}
        topicsLoading={topicsLoading}
      />
      <CommandPalette
        onClose={() => setCommandOpen(false)}
        onNavigate={navigate}
        open={commandOpen}
        topicLessons={topicLessons}
        topics={topics}
      />
    </main>
  );
}
