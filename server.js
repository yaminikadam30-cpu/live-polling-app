import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import crypto from 'node:crypto';

const app = express();
const server = createServer(app);
const io = new Server(server);
const sessions = new Map();
const QUESTION_DURATION_MS = 15000;

app.use(express.json());
app.use(express.static('.'));

const cleanText = (value, max = 180) => String(value ?? '').trim().slice(0, max);
const code = () => {
  let value;
  do value = String(Math.floor(100000 + Math.random() * 900000)); while (sessions.has(value));
  return value;
};
const publicSession = (session) => ({
  code: session.code, title: session.title, status: session.status,
  questionIndex: session.questionIndex, questionCount: session.questions.length,
  participants: session.participants.size, quizMode: session.questions.some((q) => q.quiz)
});
const sortedParticipants = (session) => [...session.participants.values()]
  .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt || a.name.localeCompare(b.name));
const leaderboard = (session, participantId = null) => {
  const sorted = sortedParticipants(session);
  const top = sorted.slice(0, 10).map((p, index) => ({ id: p.id, name: p.name, score: p.score, rank: index + 1 }));
  const ownIndex = participantId ? sorted.findIndex((p) => p.id === participantId) : -1;
  return {
    top,
    totalParticipants: sorted.length,
    participantRank: ownIndex >= 0 ? ownIndex + 1 : null,
    participantScore: ownIndex >= 0 ? sorted[ownIndex].score : null
  };
};
const activeQuestion = (session) => session.questions[session.questionIndex] ?? null;
const questionPayload = (session) => {
  const question = activeQuestion(session);
  if (!question) return null;
  return {
    id: question.id,
    text: question.text,
    options: question.options.map(({ id, text }) => ({ id, text })),
    totalAnswers: session.answers.size,
    status: session.status,
    quiz: question.quiz,
    durationMs: question.durationMs,
    startedAt: session.questionStartedAt
  };
};
const clearTimer = (session) => {
  if (session.timer) clearTimeout(session.timer);
  session.timer = null;
};
const scoreForAnswer = (session, answerAt) => {
  const question = activeQuestion(session);
  if (!question?.quiz) return 0;
  const elapsed = Math.max(0, Math.min(question.durationMs, answerAt - session.questionStartedAt));
  return Math.max(500, Math.round(1000 - (500 * elapsed / question.durationMs)));
};
const emitStats = (session) => io.to(`session:${session.code}`).emit('session:stats', publicSession(session));
const openQuestion = (session) => {
  clearTimer(session);
  session.status = 'question';
  session.answers.clear();
  session.questionStartedAt = Date.now();
  const payload = questionPayload(session);
  io.to(`session:${session.code}`).emit('question:open', payload);
  emitStats(session);
  session.timer = setTimeout(() => closeQuestion(session), activeQuestion(session)?.durationMs ?? QUESTION_DURATION_MS);
};
const closeQuestion = (session) => {
  if (!session || session.status !== 'question') return;
  clearTimer(session);
  session.status = 'results';
  const question = activeQuestion(session);
  const counts = Object.fromEntries(question.options.map((o) => [o.id, 0]));
  for (const answer of session.answers.values()) counts[answer.optionId]++;
  const earned = Object.fromEntries(session.answers.entries());
  io.to(`session:${session.code}`).emit('question:results', {
    question: questionPayload(session),
    counts,
    correctOptionId: question.correctOptionId ?? null,
    leaderboard: leaderboard(session),
    earned
  });
  emitStats(session);
};

app.post('/api/sessions', (req, res) => {
  const title = cleanText(req.body.title, 80) || 'Team pulse';
  const questions = Array.isArray(req.body.questions) ? req.body.questions.map((q) => {
    const options = (q.options || []).map((o, originalIndex) => ({ text: cleanText(o, 100), originalIndex }))
      .filter((o) => o.text).slice(0, 8).map((o, index) => ({ id: String(index), text: o.text, originalIndex: o.originalIndex }));
    const hasCorrect = q.correctOptionId !== undefined && q.correctOptionId !== null && String(q.correctOptionId) !== '';
    const correct = hasCorrect ? options.find((o) => String(o.originalIndex) === String(q.correctOptionId)) : null;
    return {
      id: crypto.randomUUID(), text: cleanText(q.text),
      options: options.map(({ id, text }) => ({ id, text })),
      correctOptionId: correct?.id,
      quiz: Boolean(correct),
      durationMs: QUESTION_DURATION_MS
    };
  }).filter((q) => q.text && q.options.length >= 2) : [];
  if (!questions.length) return res.status(400).json({ error: 'Add at least one question with two options.' });
  const session = {
    code: code(), title, questions, status: 'lobby', questionIndex: -1,
    participants: new Map(), answers: new Map(), createdAt: Date.now(), timer: null,
    questionStartedAt: null, hostToken: crypto.randomUUID()
  };
  sessions.set(session.code, session);
  res.status(201).json({ ...publicSession(session), hostToken: session.hostToken });
});

app.get('/api/sessions/:code', (req, res) => {
  const session = sessions.get(req.params.code);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  res.json(publicSession(session));
});

io.on('connection', (socket) => {
  socket.on('host:join', ({ code: sessionCode, hostToken }, reply) => {
    const session = sessions.get(sessionCode);
    if (!session) return reply?.({ error: 'Session not found.' });
    if (!hostToken || hostToken !== session.hostToken) return reply?.({ error: 'Invalid host access link.' });
    socket.join(`session:${session.code}`);
    socket.data.hostSession = session.code;
    reply?.({ session: publicSession(session), question: questionPayload(session), leaderboard: leaderboard(session) });
  });

  socket.on('participant:join', ({ code: sessionCode, name }, reply) => {
    const session = sessions.get(sessionCode); const displayName = cleanText(name, 32);
    if (!session) return reply?.({ error: 'That code does not exist.' });
    if (!displayName) return reply?.({ error: 'Enter your name to join.' });
    const participant = { id: crypto.randomUUID(), name: displayName, score: 0, joinedAt: Date.now(), connected: true };
    session.participants.set(participant.id, participant);
    socket.join(`session:${session.code}`);
    socket.data.sessionCode = session.code; socket.data.participantId = participant.id;
    emitStats(session);
    reply?.({ participant, session: publicSession(session), question: questionPayload(session), leaderboard: leaderboard(session, participant.id) });
  });

  socket.on('participant:rejoin', ({ code: sessionCode, participantId }, reply) => {
    const session = sessions.get(sessionCode); const participant = session?.participants.get(participantId);
    if (!session || !participant) return reply?.({ error: 'Your previous session could not be restored. Please join again.' });
    participant.connected = true;
    socket.join(`session:${session.code}`);
    socket.data.sessionCode = session.code; socket.data.participantId = participant.id;
    reply?.({ participant, session: publicSession(session), question: questionPayload(session), leaderboard: leaderboard(session, participant.id) });
  });

  socket.on('host:start', (reply) => {
    const session = sessions.get(socket.data.hostSession);
    if (!session || session.status !== 'lobby') return;
    session.questionIndex = 0;
    openQuestion(session);
    reply?.({ ok: true });
  });

  socket.on('host:close', (reply) => {
    const session = sessions.get(socket.data.hostSession);
    if (!session || session.status !== 'question') return;
    closeQuestion(session);
    reply?.({ ok: true });
  });

  socket.on('host:next', (reply) => {
    const session = sessions.get(socket.data.hostSession);
    if (!session || session.status !== 'results') return;
    if (session.questionIndex + 1 >= session.questions.length) {
      clearTimer(session);
      session.status = 'complete';
      io.to(`session:${session.code}`).emit('session:complete', { leaderboard: leaderboard(session) });
      emitStats(session);
    } else {
      session.questionIndex++;
      openQuestion(session);
    }
    reply?.({ ok: true });
  });

  socket.on('participant:answer', ({ optionId }, reply) => {
    const session = sessions.get(socket.data.sessionCode);
    const participant = session?.participants.get(socket.data.participantId);
    const question = session && activeQuestion(session);
    if (!session || !participant || session.status !== 'question' || !question) return reply?.({ error: 'Answers are not open.' });
    if (session.answers.has(participant.id) || !question.options.some((o) => o.id === optionId)) return reply?.({ error: 'Answer already recorded.' });
    const now = Date.now();
    if (now > session.questionStartedAt + question.durationMs) return reply?.({ error: 'Time is up.' });
    const isCorrect = question.quiz && question.correctOptionId === optionId;
    const earnedPoints = isCorrect ? scoreForAnswer(session, now) : 0;
    if (isCorrect) participant.score += earnedPoints;
    session.answers.set(participant.id, { optionId, at: now, isCorrect, earnedPoints });
    io.to(`session:${session.code}`).emit('question:progress', { totalAnswers: session.answers.size });
    reply?.({ ok: true, score: participant.score, earnedPoints, isCorrect, quiz: question.quiz });
  });

  socket.on('disconnect', () => {
    const session = sessions.get(socket.data.sessionCode);
    const participant = session?.participants.get(socket.data.participantId);
    if (session && participant) {
      participant.connected = false;
      emitStats(session);
    }
  });
});

server.listen(process.env.PORT || 3000, () => console.log('Pulse is ready at http://localhost:3000'));
