# BodyBuddy

A local web app for a couple (or any training partners) to keep each other accountable: training plans built from each person's goals and equipment, exercise demos and form cues, same-day check-ins (no backfilling) approved by a supervisor, a monthly deposit pool settled every week, and DEXA / body-composition / lab-result tracking with milestone rewards.

## Run it

Requires Node.js 18+.

```bash
npm install
npm run dev
```

Open the address printed in the terminal (http://localhost:5173 on the computer). A phone on the same Wi-Fi can open the `Network:` address.

Other commands:

- `npm test`: unit tests for deposit settlement, plan generation and lab grading
- `npm run build`: production build into `dist/`

## Features

- **Today**: the workout that's up next (A/B rotation), with demo images, form cues, set checkboxes, weight log and a rest timer. Finish and check in (optionally with a photo and the Fitbit numbers for that workout: duration, average heart rate, Active Zone Minutes, calories) for the supervisor to approve. Supervisors approve or reject check-ins and day-off requests here.
- **Plan**: generated from goals (bone density / muscle / neck-shoulder-back / fitness), gym or home equipment and body condition, in three automatic phases; any exercise can be swapped. Bone plans follow the Royal Osteoporosis Society's "Strong, Steady and Straight" consensus and Osteoporosis Canada's "Too Fit to Fracture": progressive resistance plus impact, dead-bug/bird-dog style core, no crunches or twisting, and heavy or high-impact moves locked until "cleared by a doctor" is ticked. Phase 1 workouts are capped at 60 minutes of hard training (walking excluded).
- **Daily routine & walking**: a 10-minute Straight (posture) and Steady (balance) routine with ~50 heel drops for every day, a streak, and a 150-minute weekly walking goal.
- **Weekly load check**: each week Today reviews the previous one (effort, session length, pain notes, missed sessions), says whether it was too much, and can make the coming week lighter.
- **Deposit**: a monthly deposit, required sessions per week, a fixed penalty per miss, and weekly or month-end refunds. Penalties go to the supervisor's wallet and can be spent on a wishlist. It is a ledger only; no real payments.
- **Progress**: check-in calendar, weekly streak, DEXA results with WHO zones, body composition, yearly lab results (vitamin D3, calcium, PTH, ALP, testosterone, TSH or any custom test) with typical reference ranges, trend charts, and tiered rewards (e.g. spine BMD +1% / +2% / +3%).
- **Library**: every exercise, filterable by tag or by what the current person can do; each links to YouTube and Bilibili searches or to your own saved Keep/Bilibili video.
- **Settings**: members, roles (trains / supervises only / both), goals, equipment, training days, supervision rules, and data export/import.

## Data

Everything is stored in the browser's localStorage; nothing is uploaded. Share one device, or export a backup in Settings and import it on another device.

## Credits

Exercise images come from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (Unlicense, public domain).

This app does not replace advice from a doctor or physio. Anyone with low bone density should check with a doctor before starting.
