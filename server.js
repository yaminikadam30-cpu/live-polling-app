import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import crypto from 'node:crypto';

const app = express();
const server = createServer(app);
const io = new Server(server);
const sessions = new Map();

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
  participants: session.participants.size
});
const leaderboard = (session) => [...session.participants.values()]
  .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
  .slice(0, 10).map(({ id, name, score }) => ({ id, name, score }));
const activeQuestion = (session) => session.questions[session.questionIndex] ?? null;
const questionPayload = (session) => {
  const question = activeQuestion(session);
  if (!question) return null;
  const answers = [...session.answers.values()];
  return { id: question.id, text: question.text, options: question.options.map(({ id, text }) => ({ id, text })),
    totalAnswers: answers.length, status: session.status };
};

app.post('/api/sessions', (req, res) => {
  const title = cleanText(req.body.title, 80) || 'Team pulse';
  const questions = Array.isArray(req.body.questions) ? req.body.questions.map((q) => {
    const options = (q.options || []).map((o, originalIndex) => ({ text: cleanText(o, 100), originalIndex }))
      .filter((o) => o.text).slice(0, 8).map((o, index) => ({ id: String(index), text: o.text, originalIndex: o.originalIndex }));
    const correct = options.find((o) => String(o.originalIndex) === String(q.correctOptionId));
    return { id: crypto.randomUUID(), text: cleanText(q.text),
      options: options.map(({ id, text }) => ({ id, text })), correctOptionId: correct?.id };
  }).filter((q) => q.text && q.options.length >= 2) : [];
  if (!questions.length) return res.status(400).json({ error: 'Add at least one question with two options.' });
  const session = { code: code(), title, questions, status: 'lobby', questionIndex: -1,
    participants: new Map(), answers: new Map(), createdAt: Date.now() };
  sessions.set(session.code, session);
  res.status(201).json({ ...publicSession(session), hostToken: crypto.randomUUID() });
});

app.get('/api/sessions/:code', (req, res) => {
  const session = sessions.get(req.params.code);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  res.json(publicSession(session));
});

io.on('connection', (socket) => {
  socket.on('host:join', ({ code: sessionCode }, reply) => {
    const session = sessions.get(sessionCode);
    if (!session) return reply?.({ error: 'Session not found.' });
    socket.join(`session:${session.code}`); socket.data.hostSession = session.code;
    reply?.({ session: publicSession(session), question: questionPayload(session), leaderboard: leaderboard(session) });
  });
  socket.on('participant:join', ({ code: sessionCode, name }, reply) => {
    const session = sessions.get(sessionCode); const displayName = cleanText(name, 32);
    if (!session) return reply?.({ error: 'That code does not exist.' });
    if (!displayName) return reply?.({ error: 'Enter your name to join.' });
    const participant = { id: crypto.randomUUID(), name: displayName, score: 0, joinedAt: Date.now() };
    session.participants.set(participant.id, participant); socket.join(`session:${session.code}`);
    socket.data.sessionCode = session.code; socket.data.participantId = participant.id;
    io.to(`session:${session.code}`).emit('session:stats', publicSession(session));
    reply?.({ participant, session: publicSession(session), question: questionPayload(session) });
  });
  socket.on('host:start', (reply) => {
    const session = sessions.get(socket.data.hostSession); if (!session) return;
    session.status = 'question'; session.questionIndex = 0; session.answers.clear();
    io.to(`session:${session.code}`).emit('question:open', questionPayload(session));
    io.to(`session:${session.code}`).emit('session:stats', publicSession(session)); reply?.({ ok: true });
  });
  socket.on('host:close', (reply) => {
    const session = sessions.get(socket.data.hostSession); if (!session || session.status !== 'question') return;
    session.status = 'results'; const question = activeQuestion(session); const counts = Object.fromEntries(question.options.map((o) => [o.id, 0]));
    for (const answer of session.answers.values()) counts[answer.optionId]++;
    io.to(`session:${session.code}`).emit('question:results', { question: questionPayload(session), counts, correctOptionId: question.correctOptionId ?? null, leaderboard: leaderboard(session) });
    io.to(`session:${session.code}`).emit('session:stats', publicSession(session)); reply?.({ ok: true });
  });
  socket.on('host:next', (reply) => {
    const session = sessions.get(socket.data.hostSession); if (!session) return;
    if (session.questionIndex + 1 >= session.questions.length) {
      session.status = 'complete'; io.to(`session:${session.code}`).emit('session:complete', { leaderboard: leaderboard(session) });
    } else { session.questionIndex++; session.status = 'question'; session.answers.clear(); io.to(`session:${session.code}`).emit('question:open', questionPayload(session)); }
    io.to(`session:${session.code}`).emit('session:stats', publicSession(session)); reply?.({ ok: true });
  });
  socket.on('participant:answer', ({ optionId }, reply) => {
    const session = sessions.get(socket.data.sessionCode); const participant = session?.participants.get(socket.data.participantId); const question = session && activeQuestion(session);
    if (!session || !participant || session.status !== 'question' || !question) return reply?.({ error: 'Answers are not open.' });
    if (session.answers.has(participant.id) || !question.options.some((o) => o.id === optionId)) return reply?.({ error: 'Answer already recorded.' });
    const isCorrect = question.correctOptionId === undefined || question.correctOptionId === optionId;
    if (isCorrect) participant.score += 100;
    session.answers.set(participant.id, { optionId, at: Date.now() });
    io.to(`session:${session.code}`).emit('question:progress', { totalAnswers: session.answers.size });
    reply?.({ ok: true, score: participant.score });
  });
  socket.on('disconnect', () => {
    const session = sessions.get(socket.data.sessionCode); if (session && socket.data.participantId) {
      session.participants.delete(socket.data.participantId); io.to(`session:${session.code}`).emit('session:stats', publicSession(session));
    }
  });
});

server.listen(process.env.PORT || 3000, () => console.log('Pulse is ready at http://localhost:3000'));
