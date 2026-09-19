# Pilot plan: 50 teachers by October 5, 2026

Written 2026-09-18/19. The owner's goal: 50 users by October 5. This is the
working plan, the count, the calendar, the recruiting messages, and the
debrief questions, in one place. Update it as the numbers come in.

## What counts

A **user** is a teacher who hosts a room that real students join. The
count is **distinct host browsers with a class room of three or more
students since 2026-09-18**, read at `/rooms` (owner password). Page views
and Try it out rooms do not count. One teacher on two devices counts twice;
two teachers on one laptop count once. The page says so.

## Is it viable? Three questions

| Question | Signal | Keep going if |
|---|---|---|
| Do rooms finish? | rooms that reach the end / class rooms opened (`/rooms` tiles) | 70% or more |
| Do teachers come back on their own? | a second class room under the same host key within 14 days, unprompted | half of those who finished one |
| Is the moat felt? | chain and address activities (Snowball, Someone's Got You, Doodle Bluff) picked over quiz shapes, and teachers say the class talked afterward | a third of rooms or more |

Everything else is "what could be better". These three are "is it worthwhile".

## The funnel math

| Stage | Rough rate | Needed |
|---|---|---|
| Teachers who host a real room | | 50 |
| Teachers who open the make page or Try it out | 1 in 3 hosts | 150 |
| Teachers who visit from an ask | 1 in 3 opens | 450 |
| People who see an ask | 1 in 10 clicks | 4,000 to 5,000 |

Warm channels convert five to ten times better than cold ones. Lean on
people who know you first; use cold reach to top up.

## Where 50 comes from

- **Own building, 10 to 15.** Ask every teacher you talk to. A staff-meeting
  or lunch demo with one live room beats any post. Offer to set up their
  first activity with them in five minutes.
- **District and neighbors, 10.** Instructional coaches and tech TOSAs
  forward things. One coach who puts it in a district newsletter is the
  biggest single lever. Ask two coaches by Monday.
- **Teacher friends elsewhere, 10.** Text, not email. Twenty texts, ten rooms.
- **Cold reach, 15 to 20.** LinkedIn with the square cut, Bluesky and X on
  #edchat and #edtech, two teacher Facebook groups where tools are allowed,
  r/edtech and r/Teachers only where the rules permit, one or two edtech
  newsletter authors. Slow and lumpy; expect it.
- **The product asks for it.** The console's end-of-activity card ("Know a
  teacher who would like this?") copies a link tagged `utm_source=colleague`.
  Watch that tag in PostHog.

## Calendar

- **Sept 18 to 21.** Rooms log, `/rooms`, terms page (done, PRs #48 and the
  `terms` branch). Send the Project Zero email. Text ten friends tonight.
- **Sept 22 to 26.** Building demo, coach asks, ten more texts, LinkedIn
  video live, first posts. Reply to every host within a day with the
  debrief questions. Fix only what stopped a room. **Target Friday: 15.**
- **Sept 29 to Oct 3.** Ask every host for one colleague. Newsletter
  pitches, second round of posts with a real teacher's line from week one.
  Move Render off the free tier before this week. **Target Friday: 40.**
- **Oct 4 to 5.** Last warm asks. Count.

## Before the cold wave

- Terms live as the second half of `/privacy` (`/terms` lands there). No agree step anywhere, the owner's call.
- Render paid tier (a cold start must not eat a class period).
- Project Zero email sent (`pzlearn@gse.harvard.edu`; see COMPARATIVE-ADVANTAGE § 4).
- Anonymous mode as the default for new rooms (still open; say so in the
  recruiting copy either way, it is a selling point).

## Recruiting messages

Three lengths. Swap the bracketed bits. No em dashes, no exclamation-mark
pileups, no feature lists.

### Text (a friend who teaches)

> Hey [name], I built a thing for class and I need teachers to run it once
> before Oct 5. jamyard.org. Pick an activity, press Host, kids join with a
> code on their Chromebooks, five minutes as a warm-up or exit ticket. Could
> you run one this week and tell me what broke? Coffee on me.

### Email (a colleague or a coach)

> **Subject:** Would you run one five-minute class activity for me?
>
> Hi [name],
>
> I have been building a classroom tool called Jamyard and I am trying to
> get 50 teachers to run it once by October 5 so I can find out whether it
> is worth continuing.
>
> It runs live activities where the class's own answers become the next
> step: everyone writes, the answers get grouped or passed to a classmate,
> the class talks about what came back. No accounts, no install. You press
> Host, students join with a four-letter code on any Chromebook, and their
> work is deleted when the room closes. Names never leave the room.
>
> Could you try one this week? The quickest are Exit Ticket and Live Poll
> (three minutes). The ones that show what it is really for are Snowball
> and Someone's Got You (ten minutes).
>
> jamyard.org
>
> Afterward I would love five minutes of what confused you and what the
> kids said. If anything goes wrong mid-class, text me at [number] and I
> will pick up.
>
> Thanks,
> [you]

### Post (LinkedIn, Bluesky, a teacher group)

> I built a free classroom tool and I need 50 teachers to run it once by
> October 5 to find out if it is any good.
>
> Jamyard runs live activities where the class's own answers become the
> next step. Students write in their own words on their Chromebooks, and
> what they wrote gets grouped, passed to a classmate, or voted on, and
> the class talks about what came back. No accounts, nothing to install,
> student work deleted when the room closes.
>
> If you teach and can spare five minutes this week: jamyard.org. Tell me
> what broke.

Pair the post with the square cut (`jamyard-30s-square.mp4`) once the owner
clears it for the feed.

## After every room: five questions

Ask within a day, by text or email, ten minutes at most.

1. What did you expect to happen that did not?
2. Where did you look at the screen and not know what to press?
3. What did students say to each other during and after?
4. Would you run it again next week without me? What would stop you?
5. What would you have done instead of this today?

Sort every answer into **blocked**, **confused**, **wished**. Blocked items
are the next build list. Wished items go to DEFERRED-IDEAS unless three
teachers said the same thing.

## Things that will bite

- **Support path.** A teacher with a broken room mid-class needs a phone
  number, not a feedback widget. Put it in the email and on the console.
- **Observe, do not rescue.** When a teacher stalls in front of you, count
  to ten before helping. The stall is the data.
- **Wi-fi.** Run the chaos suite against the starter five before week one.
  Tell teachers a phone hotspot works if the school network drops.
- **Minors.** Anonymous mode on by default for the cold wave, and say so.
