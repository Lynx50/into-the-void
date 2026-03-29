import { db, thoughtsTable } from "./index";
import { eq, count } from "drizzle-orm";

const SEED_USER_ID = "__seed__";

const SEED_THOUGHTS: Array<{ content: string; mood: string | null }> = [
  // thoughtful
  { content: "I wonder if the version of me that exists in other people's memories is someone I'd even recognize.", mood: "thoughtful" },
  { content: "We spend so much time preparing for moments that arrive as something completely different.", mood: "thoughtful" },
  { content: "I keep rewriting conversations in my head until the other person finally understands. They never do.", mood: "thoughtful" },
  { content: "Some friendships quietly end without a final scene, and that's somehow harder than the ones that do.", mood: "thoughtful" },
  { content: "I think about all the things I almost said and wonder who I'd be if I'd said them.", mood: "thoughtful" },
  { content: "There's a version of my life where I made the other choice. I wonder if they're wondering about me.", mood: "thoughtful" },
  { content: "Kindness from a stranger sometimes hits harder than kindness from people who love me.", mood: "thoughtful" },
  { content: "The city at 3am belongs to a different set of people than the city at noon. I want to know both sets.", mood: "thoughtful" },
  { content: "Every person I pass on the street is the main character of a life I'll never know anything about.", mood: "thoughtful" },
  { content: "I don't think most people are saying what they actually mean, ever.", mood: "thoughtful" },
  { content: "There's something peaceful about things that have existed longer than I have and will outlast me too.", mood: "thoughtful" },
  { content: "I spent years becoming someone my younger self would have admired. Now I'm not sure they'd understand me.", mood: "thoughtful" },
  { content: "Silence between two people can mean completely different things depending on who you are to each other.", mood: "thoughtful" },
  { content: "I think about the people who shaped me without ever knowing they did.", mood: "thoughtful" },
  { content: "Sometimes I hold onto something painful just so I don't have to feel the emptiness of letting it go.", mood: "thoughtful" },
  { content: "The moments I expected to feel something didn't, and the ones I didn't expect to destroyed me.", mood: "thoughtful" },
  { content: "I wonder how many versions of goodbye I've said without knowing it was the last time.", mood: "thoughtful" },
  { content: "Something about watching other people be loved makes me feel both hopeful and very far away.", mood: "thoughtful" },
  { content: "I've started recognizing my patterns, which makes them harder to live with but easier to forgive myself for.", mood: "thoughtful" },
  { content: "The things I'm most proud of are almost all things I did quietly, alone, when no one asked me to.", mood: "thoughtful" },

  // sad
  { content: "I miss someone who still exists. That's the part I don't know how to explain to anyone.", mood: "sad" },
  { content: "I have a version of my life in my head that I've been slowly saying goodbye to.", mood: "sad" },
  { content: "Some days the loneliness isn't sharp. It's just a low hum that everything else competes with.", mood: "sad" },
  { content: "I reached for my phone to tell someone something and remembered we don't talk anymore.", mood: "sad" },
  { content: "I cried at something completely ordinary today and I'm still not sure what it was really about.", mood: "sad" },
  { content: "I've been fine for months and then suddenly I wasn't, and I didn't see it coming.", mood: "sad" },
  { content: "There's a grief that comes from outgrowing something you used to love.", mood: "sad" },
  { content: "I keep expecting things to feel different than they do.", mood: "sad" },
  { content: "Sometimes I'm sad in a way that doesn't have a reason, which somehow makes it harder to sit with.", mood: "sad" },
  { content: "I want to call someone but I don't want to explain anything. I just want them to already know.", mood: "sad" },
  { content: "Watching old videos of myself is like seeing someone I used to be friends with.", mood: "sad" },
  { content: "I gave something everything I had and it still wasn't enough. I'm still figuring out what that means.", mood: "sad" },
  { content: "I don't think I'm allowed to be as sad about this as I actually am.", mood: "sad" },
  { content: "Some days I'm just moving through the motions waiting for something to feel real again.", mood: "sad" },
  { content: "The hardest part isn't missing them. It's not having anyone to miss them with.", mood: "sad" },

  // happy
  { content: "I had a moment today where I looked around and thought: this is enough. This is actually enough.", mood: "happy" },
  { content: "Someone laughed at something I said and I've been thinking about it all day.", mood: "happy" },
  { content: "I'm learning something just because I want to, with no goal attached, and it feels like exhaling.", mood: "happy" },
  { content: "I made something with my hands today and it felt like a small miracle.", mood: "happy" },
  { content: "I caught myself singing and realized I've been feeling better without noticing.", mood: "happy" },
  { content: "The light this morning was the exact kind that makes being alive feel worth it.", mood: "happy" },
  { content: "I ran into someone I love unexpectedly and it fixed something in me I didn't know was broken.", mood: "happy" },
  { content: "I've stopped pretending to enjoy things I don't and it's made room for things I actually do.", mood: "happy" },
  { content: "A small thing happened today that I won't remember in a week but right now it's everything.", mood: "happy" },
  { content: "I finished something I kept abandoning and the relief is physical.", mood: "happy" },
  { content: "I felt completely at home somewhere I wasn't expecting to.", mood: "happy" },
  { content: "Someone asked how I was doing and actually waited for the answer.", mood: "happy" },
  { content: "I had a perfect few hours where nothing needed to be different than it was.", mood: "happy" },
  { content: "I told someone how I really felt and they didn't leave. That still surprises me.", mood: "happy" },
  { content: "I am slowly becoming someone I'm glad to be.", mood: "happy" },

  // frustrated
  { content: "I keep explaining myself and somehow becoming less understood with every word.", mood: "frustrated" },
  { content: "I know exactly what I need to do. I just can't make myself do it.", mood: "frustrated" },
  { content: "Other people's certainty about things they don't understand exhausts me.", mood: "frustrated" },
  { content: "I worked hard for something and watched someone else take credit and smile about it.", mood: "frustrated" },
  { content: "I've been patient long past the point where it made sense to be.", mood: "frustrated" },
  { content: "I'm tired of adjusting to make other people comfortable with who I am.", mood: "frustrated" },
  { content: "I keep giving people the benefit of the doubt and then sitting with the consequences alone.", mood: "frustrated" },
  { content: "I know this won't matter in five years. I still want to be furious about it right now.", mood: "frustrated" },
  { content: "The person who should have apologized never did. And I'm the one who's moved on.", mood: "frustrated" },
  { content: "Everyone around me seems so sure of things I can barely make sense of.", mood: "frustrated" },

  // funny
  { content: "I responded to a work email with 'you too' after they said 'enjoy your day off.' I do not have a day off.", mood: "funny" },
  { content: "I confidently gave someone directions to a place I have never successfully located myself.", mood: "funny" },
  { content: "I said 'no worries' to something that has been worrying me for three months.", mood: "funny" },
  { content: "Convinced myself I was finally becoming a morning person. Day three. Results inconclusive.", mood: "funny" },
  { content: "Made plans with someone I genuinely like and spent the whole day hoping they'd cancel.", mood: "funny" },
  { content: "I have been meaning to do one specific thing for six months. I will probably do it in crisis mode in year two.", mood: "funny" },
  { content: "I went for a walk to clear my head. My head immediately filled with different things.", mood: "funny" },
  { content: "I said 'I'll sleep when I'm dead' and then slept for eleven hours.", mood: "funny" },
  { content: "I told someone I was 'pretty much done' with something. I had not started.", mood: "funny" },
  { content: "I ordered the same thing I always order at the place I said I was trying something different at.", mood: "funny" },

  // no mood
  { content: "I think most of us are making it up as we go and performing confidence so no one notices.", mood: null },
  { content: "There are things I've never said out loud to anyone. They still take up room.", mood: null },
  { content: "I'm trying to figure out the difference between resting and avoiding.", mood: null },
  { content: "I feel closest to people when we're both a little lost.", mood: null },
  { content: "I don't know who I'd be without the things I'm trying to grow past.", mood: null },
  { content: "I want to be known without having to explain myself.", mood: null },
  { content: "Some people carry you forward without meaning to. They don't even know.", mood: null },
  { content: "I've started noticing how often I apologize for things I'm not sorry about.", mood: null },
  { content: "Something shifted between me and someone I care about and I don't know which of us moved.", mood: null },
  { content: "I've been chasing a feeling I'm not sure I've actually had.", mood: null },
  { content: "I keep making space for people who never seem to run out of space they need.", mood: null },
  { content: "The things that are most mine are the hardest to share.", mood: null },
  { content: "I wonder what I'd think about if I wasn't always thinking about this.", mood: null },
  { content: "I hold things together in ways no one sees, and sometimes I need someone to notice.", mood: null },
  { content: "Being around the right people feels like permission to be exactly where I am.", mood: null },
  { content: "I've spent so long trying to be understood that I forgot to try to understand myself.", mood: null },
  { content: "Something in me knows the right thing to do. I'm just not ready to listen to it.", mood: null },
  { content: "I think the people who seem the most put together are hiding the most specific things.", mood: null },
  { content: "I don't need someone to fix it. I just need someone to sit with me while it's broken.", mood: null },
  { content: "I'm learning to want things without immediately talking myself out of them.", mood: null },
  { content: "There are whole seasons of my life that only exist in my memory now.", mood: null },
  { content: "I used to think I'd feel ready eventually. I've stopped waiting for that.", mood: null },
  { content: "I gave a lot to someone who treated it carelessly. I'm still deciding what to do with that.", mood: null },
  { content: "The version of me that existed five years ago would not understand why I'm okay with less.", mood: null },
  { content: "I'm doing things I never thought I'd be able to do, quietly, without announcement.", mood: null },
  { content: "I've been pretending I'm okay with less than I actually want for so long I forgot what I wanted.", mood: null },
  { content: "Something I thought would break me didn't, and now I don't know what to do with that.", mood: null },
  { content: "I'm not the person people think I am, in both directions.", mood: null },
  { content: "The longer I wait to say something the harder it gets and the more I need to say it.", mood: null },
  { content: "I want to be someone's first call, not their last resort.", mood: null },
];

async function seed() {
  console.log("Checking for existing seed thoughts...");

  const [existing] = await db
    .select({ count: count() })
    .from(thoughtsTable)
    .where(eq(thoughtsTable.userId, SEED_USER_ID));

  if ((existing?.count ?? 0) > 0) {
    console.log(`Seed thoughts already exist (${existing?.count}). Skipping.`);
    process.exit(0);
  }

  console.log(`Inserting ${SEED_THOUGHTS.length} seed thoughts...`);

  await db.insert(thoughtsTable).values(
    SEED_THOUGHTS.map((t) => ({
      userId: SEED_USER_ID,
      content: t.content,
      mood: t.mood,
    })),
  );

  console.log(`Done. ${SEED_THOUGHTS.length} seed thoughts inserted.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
