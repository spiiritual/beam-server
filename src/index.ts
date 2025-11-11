import { Hono } from 'hono'
import { auth } from './auth'
import posts from './routes/posts'

const app = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null
  }
}>();

app.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    c.set("user", null);
    c.set("session", null);
    await next();
    return;
  }
  c.set("user", session.user);
  c.set("session", session.session);
  await next();
});

app.on(["POST", "GET"], "/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.on(["POST", "GET"], "/auth/*", (c) => auth.handler(c.req.raw));
app.route('/posts', posts)

export default app
