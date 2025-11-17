import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { auth } from '../auth';
import { db } from '../db';
import { sql } from 'kysely';
import { OpenAI } from 'openai';
import { pipeline, env } from '@huggingface/transformers';
import * as z from 'zod';

const app = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
}>();

app
  .get(
    '/',
    zValidator(
      'query',
      z.object({
        lastRetrievedId: z.string().optional(),
        latitude: z.preprocess(
          val => parseFloat(val as string),
          z.number().min(-90).max(90),
        ),
        longitude: z.preprocess(
          val => parseFloat(val as string),
          z.number().min(-180).max(180),
        ),
      }),
    ),
    async c => {
      const validated = c.req.valid('query');
      let query = db.selectFrom('posts');

      if (validated.lastRetrievedId) {
        query = query.where('id', '<', validated.lastRetrievedId);
      }

      query = query
        .where(
          // if the distance in miles (converted from meters) is less than 10
          sql<number>`earth_distance(ll_to_earth(latitude, longitude), ll_to_earth(${validated.latitude}, ${validated.longitude}))/1609`,
          '<',
          10,
        )
        .select([
          'posts.id',
          'posts.date',
          'posts.content',
          sql<number>`FLOOR(earth_distance(ll_to_earth(latitude, longitude), ll_to_earth(${validated.latitude}, ${validated.longitude}))/1609)`.as(
            'distance',
          ),
        ])
        .orderBy('posts.date', 'desc')
        .limit(20);

      const posts = await query.execute();
      return c.json(posts);
    },
  )
  .post(
    zValidator(
      'json',
      z.object({
        content: z.string().max(2000),
        latitude: z.number(),
        longitude: z.number(),
      }),
    ),
    async c => {
      const validated = c.req.valid('json');
      const session = c.get('session');

      if (!session) {
        c.status(401);
        return c.text('You must be logged in to make posts.');
      } else {
        const user = c.get('user')!;
        try {
          const openai = new OpenAI();
          const moderation = await openai.moderations.create({
            model: "omni-moderation-latest",
            input: validated.content,
          })

          if (moderation.results[0].flagged) {
            c.status(503);
            return c.text("Sorry, but your text failed the moderation check.")
          }

          const sentimentAnalysisPipeline = await pipeline("text-classification", "cardiffnlp/twitter-roberta-base-sentiment-latest")
          const output = await sentimentAnalysisPipeline(validated.content)

          if ('label' in output[0] && output[0].label == "Positive") {
            const query = await db
            .insertInto('posts')
            .values({
              content: validated.content,
              author: user.id,
              latitude: validated.latitude,
              longitude: validated.longitude,
            })
            .execute();
          }
        } catch (error) {
          c.status(503);
          return c.text('Unsuccessful');
        }
        c.status(201);
        return c.text('Success');
      }
    },
  );

export default app;