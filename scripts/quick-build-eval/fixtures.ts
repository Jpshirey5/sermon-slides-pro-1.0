// Synthetic sermon documents covering the formatting conventions the Quick Build
// parser must handle, each paired with the expected extraction. Fixture text is
// intentionally realistic — announcements, illustrations, and filler included —
// so false-positive extraction shows up in scores, not just misses.

export interface ExpectedRef {
  book: string;
  chapter: number;
  start_verse: number;
  /** Main-point index the ref belongs to; null = intro/sermon-wide. */
  point_index: number | null;
}

export interface Fixture {
  name: string;
  input: { kind: "text"; text: string } | { kind: "html"; html: string };
  expected: {
    title: string;
    series: string | null;
    /** Flat list: main point titles AND subpoint titles (labels/numbering stripped). */
    points: string[];
    refs: ExpectedRef[];
  };
}

export const FIXTURES: Fixture[] = [
  {
    name: "classic-numbered-outline",
    input: {
      kind: "text",
      text: `Title: Walking in the Light
Series: First Steps

Introduction: John wrote so that our joy may be complete. Open with 1 John 1:4.

1. God is light
God's character is the starting point for fellowship. 1 John 1:5 makes the claim directly.

2. Walking in darkness breaks fellowship
If we claim fellowship while walking in darkness, we lie. See 1 John 1:6.

3. Confession restores us
He is faithful and just to forgive. 1 John 1:9 is the promise we return to.

Conclusion: Walk in the light this week.`,
    },
    expected: {
      title: "Walking in the Light",
      series: "First Steps",
      points: ["God is light", "Walking in darkness breaks fellowship", "Confession restores us"],
      refs: [
        { book: "1 John", chapter: 1, start_verse: 4, point_index: null },
        { book: "1 John", chapter: 1, start_verse: 5, point_index: 0 },
        { book: "1 John", chapter: 1, start_verse: 6, point_index: 1 },
        { book: "1 John", chapter: 1, start_verse: 9, point_index: 2 },
      ],
    },
  },
  {
    name: "all-caps-points",
    input: {
      kind: "text",
      text: `The God Who Sees
Pastor Mike — Sunday morning

We begin in Genesis 16:13 where Hagar names God.

GOD SEES THE OVERLOOKED
Hagar was a servant, a foreigner, a woman on the run. Yet God found her in the desert.

GOD HEARS THE DESPERATE
The angel says the Lord has heard of her misery. Psalm 34:15 says His ears are attentive.

GOD MEETS US IN THE WILDERNESS
The well was named Beer Lahai Roi. God met her where she was, not where she should have been.

Close in prayer.`,
    },
    expected: {
      title: "The God Who Sees",
      series: null,
      points: [
        "GOD SEES THE OVERLOOKED",
        "GOD HEARS THE DESPERATE",
        "GOD MEETS US IN THE WILDERNESS",
      ],
      refs: [
        { book: "Genesis", chapter: 16, start_verse: 13, point_index: null },
        { book: "Psalms", chapter: 34, start_verse: 15, point_index: 1 },
      ],
    },
  },
  {
    name: "bold-sentence-points-html",
    input: {
      kind: "html",
      html: `<h1>Rooted</h1><p>Series: Growing Deep</p><p>Colossians 2:6-7 sets the theme for the morning.</p><p><strong>Receiving Christ is only the beginning</strong></p><p>Paul says as you received him, so walk in him. The gospel is not a doorway we pass through once.</p><p><strong>Roots grow down before fruit grows up</strong></p><p>Being rooted precedes being built up. Compare Jeremiah 17:8 and the tree by the water.</p><p><strong>Gratitude is the evidence of depth</strong></p><p>The passage ends overflowing with thankfulness. Shallow roots produce complaints; deep roots produce thanks.</p>`,
    },
    expected: {
      title: "Rooted",
      series: "Growing Deep",
      points: [
        "Receiving Christ is only the beginning",
        "Roots grow down before fruit grows up",
        "Gratitude is the evidence of depth",
      ],
      refs: [
        { book: "Colossians", chapter: 2, start_verse: 6, point_index: null },
        { book: "Jeremiah", chapter: 17, start_verse: 8, point_index: 1 },
      ],
    },
  },
  {
    name: "big-idea-labels",
    input: {
      kind: "text",
      text: `Message: More Than Conquerors
Part 4 of: Romans — Unashamed

Big Idea: Nothing can separate us from the love of God.

Truth 1: Suffering is real but not final
Paul does not minimize hardship. Romans 8:18 weighs glory against groaning.

Truth 2: The Spirit prays when we cannot
Romans 8:26 promises intercession in our weakness.

Truth 3: God works all things for good
Romans 8:28 is a promise for those who love him, not a platitude.

Takeaway: Preach Romans 8:38-39 to yourself when accusation comes.`,
    },
    expected: {
      title: "More Than Conquerors",
      series: "Romans — Unashamed",
      points: [
        "Nothing can separate us from the love of God",
        "Suffering is real but not final",
        "The Spirit prays when we cannot",
        "God works all things for good",
        "Preach Romans 8:38-39 to yourself when accusation comes",
      ],
      refs: [
        { book: "Romans", chapter: 8, start_verse: 18, point_index: 1 },
        { book: "Romans", chapter: 8, start_verse: 26, point_index: 2 },
        { book: "Romans", chapter: 8, start_verse: 28, point_index: 3 },
        { book: "Romans", chapter: 8, start_verse: 38, point_index: 4 },
      ],
    },
  },
  {
    name: "fill-in-blank-handout",
    input: {
      kind: "text",
      text: `Sermon Notes — "Built on the Rock"
Series: Foundations

Matthew 7:24-27

1. A wise builder hears AND ____________ (Matthew 7:24)

2. The storm reveals the ____________, not the house (Matthew 7:25)

3. Hearing without doing is ____________ (Matthew 7:26)

Next week: bring your Bible and your notes.`,
    },
    expected: {
      title: "Built on the Rock",
      series: "Foundations",
      points: [
        "A wise builder hears AND ____________",
        "The storm reveals the ____________, not the house",
        "Hearing without doing is ____________",
      ],
      refs: [
        { book: "Matthew", chapter: 7, start_verse: 24, point_index: null },
        { book: "Matthew", chapter: 7, start_verse: 24, point_index: 0 },
        { book: "Matthew", chapter: 7, start_verse: 25, point_index: 1 },
        { book: "Matthew", chapter: 7, start_verse: 26, point_index: 2 },
      ],
    },
  },
  {
    name: "verses-parenthetical-on-point-line",
    input: {
      kind: "text",
      text: `Title: The Shepherd's Voice

1. The shepherd knows his sheep by name (John 10:3)
Naming implies intimacy. He does not herd anonymously.

2. The sheep know the shepherd's voice (John 10:4-5)
Familiarity comes from time in his presence, not from volume.

3. The shepherd lays down his life (John 10:11)
This is what separates the shepherd from the hired hand.`,
    },
    expected: {
      title: "The Shepherd's Voice",
      series: null,
      points: [
        "The shepherd knows his sheep by name",
        "The sheep know the shepherd's voice",
        "The shepherd lays down his life",
      ],
      refs: [
        { book: "John", chapter: 10, start_verse: 3, point_index: 0 },
        { book: "John", chapter: 10, start_verse: 4, point_index: 1 },
        { book: "John", chapter: 10, start_verse: 11, point_index: 2 },
      ],
    },
  },
  {
    name: "scripture-labeled-lines",
    input: {
      kind: "text",
      text: `Abide — Sunday Message

Point 1: Apart from him we can do nothing
Scripture: John 15:5
The branch does not strain to produce fruit; it stays connected.

Point 2: Pruning is not punishment
Scripture: John 15:2
Text: Hebrews 12:11
The Father cuts back what is good to make way for what is better.

Point 3: Abiding produces joy
Scripture: John 15:11
Joy is the byproduct of remaining, not the goal of striving.`,
    },
    expected: {
      title: "Abide",
      series: null,
      points: [
        "Apart from him we can do nothing",
        "Pruning is not punishment",
        "Abiding produces joy",
      ],
      refs: [
        { book: "John", chapter: 15, start_verse: 5, point_index: 0 },
        { book: "John", chapter: 15, start_verse: 2, point_index: 1 },
        { book: "Hebrews", chapter: 12, start_verse: 11, point_index: 1 },
        { book: "John", chapter: 15, start_verse: 11, point_index: 2 },
      ],
    },
  },
  {
    name: "end-of-point-verse-blocks",
    input: {
      kind: "text",
      text: `Title: Generous Like God
Series: Kingdom Economics

1. Everything we have is given
We are stewards, not owners. Hold possessions with an open hand.
Verses to read:
1 Chronicles 29:14
James 1:17

2. Giving breaks the grip of greed
Generosity is the practical antidote to materialism.
Verses to read:
Matthew 6:24
2 Corinthians 9:7

3. God multiplies what we release
The boy's lunch fed thousands only after it left his hands.
Verses to read:
John 6:9
Luke 6:38`,
    },
    expected: {
      title: "Generous Like God",
      series: "Kingdom Economics",
      points: [
        "Everything we have is given",
        "Giving breaks the grip of greed",
        "God multiplies what we release",
      ],
      refs: [
        { book: "1 Chronicles", chapter: 29, start_verse: 14, point_index: 0 },
        { book: "James", chapter: 1, start_verse: 17, point_index: 0 },
        { book: "Matthew", chapter: 6, start_verse: 24, point_index: 1 },
        { book: "2 Corinthians", chapter: 9, start_verse: 7, point_index: 1 },
        { book: "John", chapter: 6, start_verse: 9, point_index: 2 },
        { book: "Luke", chapter: 6, start_verse: 38, point_index: 2 },
      ],
    },
  },
  {
    name: "cross-chapter-range",
    input: {
      kind: "text",
      text: `Title: Light and Advocate

1. Walk in the light
Our main text is 1 John 1:5-2:2, read it slowly. Fellowship with God means honesty about sin.

2. We have an advocate
When we sin, Jesus Christ the righteous speaks in our defense.`,
    },
    expected: {
      title: "Light and Advocate",
      series: null,
      points: ["Walk in the light", "We have an advocate"],
      refs: [
        { book: "1 John", chapter: 1, start_verse: 5, point_index: 0 },
        { book: "1 John", chapter: 2, start_verse: 1, point_index: 0 },
      ],
    },
  },
  {
    name: "announcements-polluted",
    input: {
      kind: "html",
      html: `<h1>Sunday Service — June 14</h1><h2>Announcements</h2><ul><li>Vacation Bible School registration closes Friday</li><li>Men's breakfast next Saturday at 8am</li><li>Building fund update in the lobby</li></ul><h2>Worship Set</h2><ul><li>Great Are You Lord</li><li>Living Hope</li><li>Cornerstone</li></ul><h2>Sermon: Unhurried — Learning the Rhythms of Jesus</h2><p>Series: Emotionally Healthy</p><p>Mark 1:35 shows Jesus withdrawing to pray while it was still dark.</p><h3>1. Jesus was never in a hurry</h3><p>He walked everywhere and still finished everything the Father gave him.</p><h3>2. Solitude was his rhythm, not his escape</h3><p>Luke 5:16 says he often withdrew to lonely places.</p><h3>3. Hurry is the enemy of love</h3><p>You cannot love people at speed. Offering will be received as we close.</p><h2>Offering &amp; Benediction</h2><p>Doxology — see you next week.</p>`,
    },
    expected: {
      title: "Unhurried — Learning the Rhythms of Jesus",
      series: "Emotionally Healthy",
      points: [
        "Jesus was never in a hurry",
        "Solitude was his rhythm, not his escape",
        "Hurry is the enemy of love",
      ],
      refs: [
        { book: "Mark", chapter: 1, start_verse: 35, point_index: null },
        { book: "Luke", chapter: 5, start_verse: 16, point_index: 1 },
      ],
    },
  },
  {
    name: "illustration-heavy-manuscript",
    input: {
      kind: "text",
      text: `Title: The Prodigal's Father
Series: Parables

Illustration: A father in our church waited eleven years for a phone call from his son. When it finally came, he drove through the night.

1. The father lets him go
Luke 15:12 — he divided the property between them. Love that controls is not love.

Illustration: C.S. Lewis said the doors of hell are locked from the inside.

2. The father runs
Luke 15:20 — while he was still a long way off. In that culture, patriarchs did not run. Grace is undignified.

Quote: "The gospel is this: we are more sinful than we ever dared believe, and more loved than we ever dared hope." — Tim Keller

3. The father throws a feast
Luke 15:23 — the robe, the ring, the fattened calf. Restoration is celebration, not probation.

Application: Who are you waiting on? Make the call this week.`,
    },
    expected: {
      title: "The Prodigal's Father",
      series: "Parables",
      points: ["The father lets him go", "The father runs", "The father throws a feast"],
      refs: [
        { book: "Luke", chapter: 15, start_verse: 12, point_index: 0 },
        { book: "Luke", chapter: 15, start_verse: 20, point_index: 1 },
        { book: "Luke", chapter: 15, start_verse: 23, point_index: 2 },
      ],
    },
  },
  {
    name: "no-points-topical",
    input: {
      kind: "text",
      text: `A Word of Comfort

Some weeks do not need three points. This week our church buried a saint, and the only thing worth saying is that God is near to the brokenhearted, as Psalm 34:18 promises. We will sit with that verse together, read it in every translation we have, and let it do its work. Grief is not a problem to be solved but a place to be accompanied. Come, Lord Jesus.`,
    },
    expected: {
      title: "A Word of Comfort",
      series: null,
      points: [],
      refs: [{ book: "Psalms", chapter: 34, start_verse: 18, point_index: null }],
    },
  },
  {
    name: "subpoints-nested-outline",
    input: {
      kind: "text",
      text: `Title: Armor of God
Series: Ephesians

1. Know your enemy
Our struggle is not against flesh and blood. Ephesians 6:12.
  a. The devil schemes
  b. The battle is spiritual

2. Take up the armor
Ephesians 6:13 — so that when the day of evil comes, you may stand.
  a. The belt of truth (Ephesians 6:14)
  b. The shield of faith (Ephesians 6:16)

3. Pray at all times
Ephesians 6:18 — with all kinds of prayers and requests.`,
    },
    expected: {
      title: "Armor of God",
      series: "Ephesians",
      points: [
        "Know your enemy",
        "The devil schemes",
        "The battle is spiritual",
        "Take up the armor",
        "The belt of truth",
        "The shield of faith",
        "Pray at all times",
      ],
      refs: [
        { book: "Ephesians", chapter: 6, start_verse: 12, point_index: 0 },
        { book: "Ephesians", chapter: 6, start_verse: 13, point_index: 1 },
        { book: "Ephesians", chapter: 6, start_verse: 14, point_index: 1 },
        { book: "Ephesians", chapter: 6, start_verse: 16, point_index: 1 },
        { book: "Ephesians", chapter: 6, start_verse: 18, point_index: 2 },
      ],
    },
  },
];
