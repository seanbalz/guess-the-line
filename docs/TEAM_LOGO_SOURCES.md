# NFL team marks and Premier League crests — source register

Updated: October 28, 2026 (Premier League crests for all 20 clubs; D-46 official NFL logos for all 32 teams, October 14, 2026) · Owner: team-logo workflow agent

## Official logos (D-46)

**All 32 teams show their official logo (D-46, October 14, 2026).** Sean's rulings in the Mac mini session: "Yes" to switching all 32 teams to ESPN's official logos, shown next to each team's name with a trademark notice; and, asked "What should the 17 teams show?", "Find all logos for all nfl teams and use them". This supersedes the D-22 public-domain-only rule and the [public-domain register below](#superseded-public-domain-register-d-22), which stays as history.

### Basis

- **Identification only.** Each logo appears only beside, or in place of, the team's name in matchup and data displays (`TeamIdentity`, `TeamMark`). No team mark becomes Guess The Line branding, the app icon, advertising or merchandise.
- **Trademark notice.** "NFL and team names, logos and marks are trademarks of the NFL and its teams; used here only to identify the teams. No endorsement." It is on the Terms page (`web/public/terms.html`, "Team names and logos") and in `TEAM_TRADEMARK_NOTICE` in `web/src/teamLogoRegistry.js`.
- **Not licensed.** No NFL or team license, permission or endorsement is claimed. Registry status: `rightsStatus: 'trademark-identification'`.
- **Fallback.** If a logo fails to load, the team's [original GTL badge](#original-badges) replaces it where one exists (19 teams), and otherwise, or if that fails too, the abbreviation shows.

### Source

- **Index:** the nflverse teams file, `https://github.com/nflverse/nflverse-data/releases/download/teams/teams_colors_logos.csv`, fetched 2026-10-14T22:43:21Z. Only the 32 current franchises are used; the historical rows (`OAK`, `SD`, `STL`) and the duplicate `LA` Rams row are skipped in favour of `LAR`.
- **Images:** the `team_logo_espn` column of each row, PNGs on ESPN's CDN (`https://a.espncdn.com/i/teamlogos/nfl/...`). The file lists Carolina's `500-dark` variant and Washington as `wsh.png`; both are used as listed.
- **Checks on every original:** PNG, RGBA with an alpha channel, all four corners fully transparent. All 32 passed; no artwork was edited.
- **Self-hosted, never hotlinked.** Each original was downscaled once (Pillow, LANCZOS) to 128 px on its longer side, twice the largest rendered size (64 CSS px in `TeamIdentity`, 48 in `TeamMark`). No recolor, no crop; aspect ratio and alpha kept. Nothing renders above 64 CSS px, so no 256 px copy ships.
- `web/public/team-logos/sources.json` records, for each team, the source URL, the CSV row (`team_abbr`, `team_name`), the fetch time (UTC), the original's SHA-256, size and pixel dimensions, and the shipped file's name, size and SHA-256. `tests/team-marks.test.mjs` checks every shipped file against it.

### Register

| Team | Name | File | ESPN path (`/i/teamlogos/nfl/`) | Original | Original SHA-256 | Shipped | Shipped SHA-256 |
|---|---|---|---|---|---|---|---|
| ARI | Arizona Cardinals | `ari.png` | `500/ari.png` | 500×500, 41,994 B | `f870b58b43585a5b7717d578dd433b0b1e0c462d64ef4bea2aeb8c03f4ae7854` | 128×128, 11,272 B | `a1fb968d728e369d2382b04d7c9beaf1d42236ace9a85a355b189cf74aef62e8` |
| ATL | Atlanta Falcons | `atl.png` | `500/atl.png` | 500×500, 51,781 B | `fe566e9da6f7986b2bac321571bd751247ff93af15c51ae555486fb1bee90c91` | 128×128, 15,313 B | `cd09027ae954c5c7918a1521bae1ff3d16b28f34cf124411e9c801bf8adb0701` |
| BAL | Baltimore Ravens | `bal.png` | `500/bal.png` | 500×500, 55,985 B | `67796023c172c9aeab5bcdac9204823d3590097246ad1cb92971134b5f26dcc0` | 128×128, 11,114 B | `912c6888db0c65269fa9cdc3b9a4a4a8bb94fd2e329a6b67dc8d58672b95ffcb` |
| BUF | Buffalo Bills | `buf.png` | `500/buf.png` | 500×500, 38,004 B | `79b71e2f536ee29f9d23834e89828883af2d95bf6968cbd07a505444229cdd20` | 128×128, 10,429 B | `6d6bbc723ec63ba1e23b9175e566a8cdacd5fc350d5c0993a55e5eb08e85c579` |
| CAR | Carolina Panthers | `car.png` | `500-dark/car.png` | 500×500, 36,636 B | `2cebc1bbdcfd89f28c1578b397f440d229d93fa9a30bfa1193cc286482c82298` | 128×128, 7,896 B | `499ef716d5dad0feb974a19885e67ff2fb2cf6cfde72f136a4891e2bfd8328b8` |
| CHI | Chicago Bears | `chi.png` | `500/chi.png` | 500×500, 93,593 B | `fd7b5a207b9ad443f950b384d43dba6cb367c5737ad50a51a15e3893fa31753b` | 128×128, 21,338 B | `577fdb2597970293728cf4b4709d9a1f37b3365a424b64a3cc1213a32cb40b38` |
| CIN | Cincinnati Bengals | `cin.png` | `500/cin.png` | 500×500, 26,628 B | `8e549c0ecac92453140370b2aef3e4a140139b50d16e92507532e8ee49930d4e` | 128×128, 8,089 B | `650e247ffb6d8aed981ddb48fc4912809f461221b42472c9ffe252aa84fd8255` |
| CLE | Cleveland Browns | `cle.png` | `500/cle.png` | 500×500, 94,482 B | `9b286fc4286dc39b1b5a6a08aab042b456ba5fdce99e45e49a4d1e2672411fa2` | 128×128, 15,996 B | `1aed3c252f94ea37f06f12da92b72e508d775766c9cecb79a0914a05fb7a8836` |
| DAL | Dallas Cowboys | `dal.png` | `500/dal.png` | 500×500, 32,372 B | `f4ea9a2ec7d7d500f08db94c8c6f1b23f75361ffe39c4d4b480a684a511ce61e` | 128×128, 9,300 B | `2cdb5af385ff89bb0649fa88320dd8039d7b539caaaf818ff2ac628d3130bc88` |
| DEN | Denver Broncos | `den.png` | `500/den.png` | 500×500, 40,948 B | `c98bec2be32e27b19f79f5da86ac6ef133c78d75ab78aadb28ef36696c3213e8` | 128×128, 10,188 B | `620056926340391104d4db91c2f62ba773ce7c6ba811f174557b329e306ad0a8` |
| DET | Detroit Lions | `det.png` | `500/det.png` | 500×500, 57,465 B | `9776b567ebab0bd3640165e915d948d8e736e35967dfc19ce62b967cfe7b4eb1` | 128×128, 13,010 B | `bc0e8f195ce71af1d5852150bfb82f64e67b0861c587ff1e159f48ed66a9ccd5` |
| GB | Green Bay Packers | `gb.png` | `500/gb.png` | 500×500, 39,188 B | `7ea8154cdbff5db84d248f235c1f1c78a1a8b4cb8c14335b5886ec10ee20b00e` | 128×128, 10,962 B | `f106e3cdd9bb2ad36d14e8ab4bdbc82ea4d4ca8bf7736921501b9fcff0fa85f8` |
| HOU | Houston Texans | `hou.png` | `500/hou.png` | 500×500, 35,767 B | `54b0fe559761860e4953851c197d995b2f9c0c4e278164edda7b608ffd64f39b` | 128×128, 10,250 B | `7d58a568cdbc60a66e3fc2b452ebe0c280b840d67a14f56d020f3493dda8d9a0` |
| IND | Indianapolis Colts | `ind.png` | `500/ind.png` | 500×500, 42,083 B | `f1f5222a876f810956aa8d4e75d4e6b47bcb3a6d11f876642b674010233c8a97` | 128×128, 11,348 B | `f891a0843461c7db49c1e9114873d488d9855cda7907bdd84e8b252fffa299f2` |
| JAX | Jacksonville Jaguars | `jax.png` | `500/jax.png` | 500×500, 78,814 B | `15cb9a1c77ebfaea885d0d3a34f33dabc4e6a00eb7d5462148fceed641d49397` | 128×128, 16,557 B | `5b0ec61a57ebb4d8b6e50075ac991ced0785d70fae3abeaeb74fae116d61873e` |
| KC | Kansas City Chiefs | `kc.png` | `500/kc.png` | 500×500, 40,228 B | `3d77958dc6373768919bb2681cbe1b143f56c07a1f013460def665a5026a7f3d` | 128×128, 11,250 B | `3c24dc52abebe72ff75ebc4ded56a835219b37c1f40ca275d8447019a1ce573f` |
| LAC | Los Angeles Chargers | `lac.png` | `500/lac.png` | 500×500, 32,850 B | `5400f85bd93129c056717a771da57a97225e15f39c0022107ce89ef993f15bb0` | 128×128, 7,600 B | `7911b033a82921abfe6f2721b9d87317ae5fdf409f2432a2af128d8dcac89d23` |
| LAR | Los Angeles Rams | `lar.png` | `500/lar.png` | 500×500, 38,707 B | `e289b738a5e1259cccea921bee02eec881d35b4241761a8c4e12fe5964cab75c` | 128×128, 7,758 B | `88638b4c070871bfed1283175cdb7397586a8d3b93d1e404fa6c953e13d887f6` |
| LV | Las Vegas Raiders | `lv.png` | `500/lv.png` | 500×500, 27,355 B | `94de716ea6d3859effbfbc0966c8327eefc0a004e0d2f16c77ca80b58fd95eaa` | 128×128, 15,136 B | `b6b4354f14829c9cb10184d5079d7655b265fd207f193bc63163cc23892ad536` |
| MIA | Miami Dolphins | `mia.png` | `500/mia.png` | 500×500, 64,408 B | `b9631269a82abda39bd748afc82390679ca67bfc167bc3581665e237407de8e0` | 128×128, 13,287 B | `946ec6101cb1fe9da99fe1beea5dda28f40e026bcc8cd7cf2fd7e36adf1e0fe1` |
| MIN | Minnesota Vikings | `min.png` | `500/min.png` | 500×500, 69,686 B | `72759956b149bc1c9496ea6ebb9a6ae34093dfed371cc6abb425c13f14f53448` | 128×128, 16,756 B | `b02519e50cb03a87ff17e51f4d7f93cb2ab98e0340374f2fcca6c94287bb3c53` |
| NE | New England Patriots | `ne.png` | `500/ne.png` | 500×500, 32,083 B | `dac19aa9a573dcf9075e2422bee3e35a4955b9ab494bb3191ab3bacfd3609729` | 128×128, 7,432 B | `e880aec30e9582eb963c35d87b6070a819f1163e15ecb6a2cddc4d359ffd8c45` |
| NO | New Orleans Saints | `no.png` | `500/no.png` | 500×500, 52,016 B | `68ddfdf1d7ee8317f1af083a0c6d59142a11e8af4dad73c3c50bbafc338e0a94` | 128×128, 12,714 B | `d8cb70ad5ca105de779983a8ca9676b4f510f339ae701a754eedf338bd670438` |
| NYG | New York Giants | `nyg.png` | `500/nyg.png` | 500×500, 7,574 B | `62e361850e7ba3a50dfd09cbb38429e994d1c23b0f999c74421f10e37c7067e7` | 128×128, 3,150 B | `aaec250fbf4c938e9c4df4b1a8b758fc401e7e69b7441d6bc0a973fe3a8e1245` |
| NYJ | New York Jets | `nyj.png` | `500/nyj.png` | 4096×4096, 130,614 B | `5de8d029f3602c97ffe02bd636eb2630e55d019d1a37cf819d3b9e39a219487b` | 128×128, 3,854 B | `ccf503a38e054fada1795a4858f8fdcad27474b6dce45d91f4ef4df1970ab1e8` |
| PHI | Philadelphia Eagles | `phi.png` | `500/phi.png` | 500×500, 70,332 B | `2875f50f8b756ed5ea3866105b4683f5c603aa542e2c7f7870287e1d3d006100` | 128×128, 14,302 B | `b8c706cc69999b04675f14cd13a3279fa388b371c0a5d226ff07a4ed00524400` |
| PIT | Pittsburgh Steelers | `pit.png` | `500/pit.png` | 500×500, 56,620 B | `806bcb72e75ed184a99bea34df458e6cd87145fc9a863945f3356b01122aeb6f` | 128×128, 15,323 B | `af44f1bfc7b3da49a9d61196df6428fa45a180431411aa5381f0e4fc7529ea97` |
| SEA | Seattle Seahawks | `sea.png` | `500/sea.png` | 500×500, 32,081 B | `2546b1d4fe5cf6c2d75cda53d3fb56bbc4dd43c6b00200586dab5a85df8fa492` | 128×128, 7,655 B | `390c4c0abe59e2075b8ebc900d50013737c744b1ffe5005740d793221595a1db` |
| SF | San Francisco 49ers | `sf.png` | `500/sf.png` | 500×500, 48,699 B | `82ae812f6c15718ce5abdd402863e8b4553fa9971e4baa5d45ff585c52948a45` | 128×128, 12,620 B | `8ec5d8bb1a09405f1b7a81ff5997b832a5fd1c6f5a06e5d199dc38688b1c3c62` |
| TB | Tampa Bay Buccaneers | `tb.png` | `500/tb.png` | 500×500, 96,110 B | `bcc5d267024650938c9f35558077fe00a31913b89c61768d4ebb63d1ea31fbfd` | 128×128, 17,378 B | `c061c1f106347e82d24663b5d97a1ac787a97133692ff788ab988c4f137fd17a` |
| TEN | Tennessee Titans | `ten.png` | `500/ten.png` | 500×500, 50,732 B | `27cf283fca5b2e9e1c5e995a465a54223424c157d2013b603a6491f99333cf45` | 128×128, 15,021 B | `4ec8135eba0e61c238da18f2b152be8eaeb94ce55f6ef06315a3983e73fe607a` |
| WAS | Washington Commanders | `was.png` | `500/wsh.png` | 500×500, 30,416 B | `2f67805ef9e385a4c67adb0a9320706bd481a52e3aa0e0faea995dad2b501112` | 128×128, 7,742 B | `b8065fa19b83a58add905ebd204f7abea089421e377a0f360fcbc90d4fe4f78b` |

### Readability

Measured on each original's opaque pixels against the page canvas from `design/tokens.json` (light `#F8FAFC`, dark `#0B1020`). Listed where at least half the opaque pixels are under 1.5:1 or at least 70% are under 3:1. The logos are not altered; in the new app every mark sits on a ringed `--gx-surface-2` tile, which helps.

- **Dark theme:** ARI (37% under 1.5:1, 76% under 3:1), CAR (77% under 1.5:1, 80% under 3:1), DAL (72% under 1.5:1, 73% under 3:1), HOU (50% under 1.5:1, 51% under 3:1), IND (7% under 1.5:1, 74% under 3:1), LAR (0% under 1.5:1, 100% under 3:1), LV (58% under 1.5:1, 60% under 3:1), NYG (100% under 1.5:1, 100% under 3:1), NYJ (0% under 1.5:1, 100% under 3:1), WAS (58% under 1.5:1, 61% under 3:1).
- **Light theme:** KC (57% under 1.5:1, 60% under 3:1), PIT (51% under 1.5:1, 85% under 3:1), TEN (35% under 1.5:1, 82% under 3:1).

#### Backing chip (approved by Sean, October 14, 2026: "Yes I want that")

One rule for all 32 official logos, with no per-team cases. **In Dark**, each logo sits on a round light-neutral chip with small padding:
- Old app: token `text` `#F8FAFC` (`design/tokens.json` `colors.text`), with 8% padding (`web/src/teamIdentity.css`).
- New app: `--gx-text-1` `#F5F7FB`, with 2 px padding inside the tile (`web/src/next/styles/components.css`).

**In Light** the chip is transparent. Badges and the letter fallback are unchanged.

The same measurement against the Dark chip leaves:
- Old app (`#F8FAFC`): KC (57% / 60%), PIT (51% / 85%) and TEN (35% / 82%).
- New app (`#F5F7FB`): KC (57% / 60%), LAC (55% / 64%), PIT (51% / 85%) and TEN (35% / 84%).

All 10 Dark-canvas flags above (ARI, CAR, DAL, HOU, IND, LAR, LV, NYG, NYJ, WAS) clear.

In Light, measured on the page: KC, PIT and TEN stay flagged, as above. Against the new app's tile (`--gx-surface-2` `#F3F5F9`), LAC (55% / 64%) is flagged too.

No token-based neutral chip clears KC, PIT and TEN without flagging others:
- Every light token leaves KC and PIT flagged.
- The mid-gray `#95A2BB` still flags TEN and newly flags CLE, DET and LAC (and MIA, SF and TB). The mid-gray `#7A89A6` still flags TEN, newly flags CLE, DET and LAC, and also flags BUF, LAR and NYJ.
- A dark chip flags the navy and black marks.

These three logos are mostly white or light fields drawn inside dark outlines, so a light backing is not added in Light; the [backing override](#backing-override) below handles them.

#### Backing removed (October 15, 2026)

Sean: "Remove the black background behind some of the logos. They does not need any of them". No official logo has a backing chip any more, in either theme or app; the sections below are kept as the history of the measurement.

#### Backing override

Approved by Sean on October 14, 2026: "Move forward with rec".

`backing: 'dark'` in `web/src/teamLogoRegistry.js` (`darkBackingTeams`) puts a logo on a dark chip in both themes. The chip has the same size and padding as the light chip. The colors:

| App | Dark | Light |
|---|---|---|
| Old | `--canvas` `#0B1020` | `--text` `#0B1020` |
| New | `--gx-canvas` `#070B16` | `--gx-text-1` `#0B1020` |

**How the teams were chosen** (measured, not chosen by eye):
1. A logo gets the override when its default backing is flagged in Light in either app, and the dark chip is not flagged in Light in either app.
2. In Dark, an override logo then takes the dark chip only where that measures better than the light chip. The measure is the share under 1.5:1 plus the share under 3:1.

The result is **KC, LAC, PIT and TEN**. All four measure better on the dark chip in Dark too:

| Team | Light chip or transparent (Dark / Light) | Dark chip (Dark / Light) |
|---|---|---|
| KC | 57% / 60%, flagged | 20% / 24% |
| LAC | New app only: 55% / 64%, flagged. Old app: 18% / 63%, not flagged | 0% / 0% |
| PIT | 51% / 85%, flagged | 5% / 9% |
| TEN | 35% / 82–84%, flagged | 0% / 0% |

Every other logo keeps the default rule.

**All 32 teams with the backing they now get.** Each cell is the share of opaque pixels under 1.5:1 / under 3:1. The backgrounds measured:
- **Old app.** Dark: `#F8FAFC` chip, or `#0B1020` for overrides. Light: page `#F8FAFC`, or the `#0B1020` chip.
- **New app.** Dark: `#F5F7FB` chip, or `#070B16` for overrides. Light: tile `#F3F5F9`, or the `#0B1020` chip.

**Nothing is flagged in either theme in either app.**

| Team | Backing | Old Dark | Old Light | New Dark | New Light |
|---|---|---|---|---|---|
| ARI | default | 16% / 21% | 16% / 21% | 17% / 21% | 17% / 21% |
| ATL | default | 23% / 45% | 23% / 45% | 23% / 45% | 23% / 45% |
| BAL | default | 26% / 32% | 26% / 32% | 26% / 34% | 26% / 35% |
| BUF | default | 20% / 23% | 20% / 23% | 20% / 24% | 20% / 24% |
| CAR | default | 0% / 3% | 0% / 3% | 0% / 6% | 0% / 6% |
| CHI | default | 7% / 8% | 7% / 8% | 7% / 8% | 7% / 8% |
| CIN | default | 23% / 25% | 23% / 25% | 23% / 25% | 23% / 25% |
| CLE | default | 29% / 33% | 29% / 33% | 29% / 33% | 29% / 33% |
| DAL | default | 22% / 25% | 22% / 25% | 22% / 25% | 22% / 25% |
| DEN | default | 44% / 47% | 44% / 47% | 44% / 47% | 44% / 47% |
| DET | default | 20% / 38% | 20% / 38% | 20% / 39% | 20% / 39% |
| GB | default | 44% / 52% | 44% / 52% | 46% / 52% | 46% / 52% |
| HOU | default | 28% / 30% | 28% / 30% | 28% / 31% | 28% / 31% |
| IND | default | 23% / 25% | 23% / 25% | 23% / 25% | 23% / 25% |
| JAX | default | 20% / 38% | 20% / 38% | 20% / 40% | 20% / 40% |
| KC | dark chip | 20% / 24% | 20% / 24% | 20% / 24% | 20% / 24% |
| LAC | dark chip | 0% / 0% | 0% / 0% | 0% / 0% | 0% / 0% |
| LAR | default | 0% / 0% | 0% / 0% | 0% / 0% | 0% / 0% |
| LV | default | 28% / 37% | 28% / 37% | 28% / 37% | 28% / 37% |
| MIA | default | 43% / 49% | 43% / 49% | 43% / 49% | 43% / 50% |
| MIN | default | 29% / 62% | 29% / 62% | 49% / 62% | 49% / 62% |
| NE | default | 30% / 40% | 30% / 40% | 30% / 40% | 30% / 40% |
| NO | default | 11% / 50% | 11% / 50% | 14% / 50% | 14% / 50% |
| NYG | default | 0% / 0% | 0% / 0% | 0% / 0% | 0% / 0% |
| NYJ | default | 0% / 0% | 0% / 0% | 0% / 0% | 0% / 0% |
| PHI | default | 31% / 55% | 31% / 55% | 31% / 55% | 31% / 55% |
| PIT | dark chip | 5% / 9% | 5% / 9% | 5% / 9% | 5% / 9% |
| SEA | default | 34% / 53% | 34% / 53% | 34% / 53% | 34% / 53% |
| SF | default | 23% / 31% | 23% / 31% | 23% / 32% | 23% / 32% |
| TB | default | 9% / 21% | 9% / 21% | 9% / 21% | 9% / 21% |
| TEN | dark chip | 0% / 0% | 0% / 0% | 0% / 0% | 0% / 0% |
| WAS | default | 0% / 37% | 0% / 37% | 6% / 37% | 6% / 37% |

## Premier League crests

**All 20 Premier League clubs of the 2026-27 season show their crest** (plan `docs/superpowers/plans/2026-10-28-epl-pick-a-team.md`, Task 6; spec `docs/superpowers/specs/2026-10-28-epl-fantasy-and-moneyline-design.md` section 8). The [D-46 rule](#official-logos-d-46) is extended unchanged to EPL clubs. Promoted and relegated clubs change each season: update `shared/epl-clubs.mjs`, rerun the script and this register.

### Basis

- **Identification only.** Each crest appears only beside, or in place of, the club's name in Pick a Team and EPL data displays. No club crest becomes Guess The Line branding, the app icon, advertising or merchandise.
- **Trademark notice.** "Premier League and club names, crests and marks are trademarks of their owners; used here only to identify the clubs. No endorsement." It is on the Terms page (`web/public/terms.html`, "Team names and logos") and in `EPL_TRADEMARK_NOTICE` in `web/src/teamLogoRegistry.js`.
- **Not licensed.** No Premier League or club license, permission or endorsement is claimed. `sources.json` records `rightsBasis: "trademark-identification"` and `licensed: false`.
- **Lookup.** `resolveClubCrest(code)` in `web/src/teamLogoRegistry.js` returns `{src, alt}` (alt is "<club name> crest") or `null`. EPL codes are kept out of `teamMarks`, so `resolveTeamMark` never returns a crest.
- **Dark mode.** The spec puts a light chip behind crests in dark mode (several crests, such as TOT, NFO and FUL, are dark or monochrome); that is a UI task, not part of the files.

### Source

- **Club list:** `shared/epl-clubs.mjs` (`EPL_CLUBS`: code, name, ESPN team id). Manchester United's ESPN abbreviation is `MAN`; the app code is `MUN`.
- **Images:** `https://a.espncdn.com/i/teamlogos/soccer/500/<espnId>.png`, fetched 2026-10-28T21:50:14Z to 2026-10-28T21:50:18Z by `scripts/fetch-epl-crests.py`.
- **Checks on every original:** PNG, RGBA with an alpha channel, all four corners fully transparent. All 20 passed; no artwork was edited. A contact sheet of the 20 shipped files was checked by eye against the club names.
- **Self-hosted, never hotlinked.** Each original was downscaled once (Pillow, LANCZOS) to 128 px on its longer side. No recolor, no crop; aspect ratio and alpha kept. Files: `web/public/team-logos/epl/<CODE>.png`.
- `web/public/team-logos/epl/sources.json` records, for each club, the source URL, the club-list row (`code`, `name`, `espnId`), the fetch time (UTC), the original's SHA-256, size and pixel dimensions, and the shipped file's name, size and SHA-256. `tests/epl-crests.test.mjs` checks every shipped file against it.

### Register

| Club | Name | File | ESPN path (`/i/teamlogos/soccer/500/`) | Original | Original SHA-256 | Shipped | Shipped SHA-256 |
|---|---|---|---|---|---|---|---|
| BOU | Bournemouth | `BOU.png` | `349.png` | 500×500, 61,133 B | `0383002b303b31fd4672b7823672c472660be4f2175d84ac480a26e1a06e61bb` | 128×128, 20,722 B | `ef9f309aede6539ce7b76e2c86349fc5db12a4528d983912ad7dff5e1e8e98f0` |
| ARS | Arsenal | `ARS.png` | `359.png` | 500×500, 36,280 B | `92f1bb35662ff56dde09e1f8084221a458357a6df390bc97b2ed6495f6e39f53` | 128×128, 21,090 B | `edd82a851425dd4fa3af2a6210f6968fcaec3f01bb09c54901d507aff9c0d8bf` |
| AVL | Aston Villa | `AVL.png` | `362.png` | 500×500, 78,018 B | `aad2e636ade60b485855deacfe74f831c8dcae46de72079c7f521b06c1b5865b` | 128×128, 16,056 B | `e80b0b00b56a9d93ce81bbf5425f41e7248ec4714c27a410a6cd766cb563cbab` |
| BRE | Brentford | `BRE.png` | `337.png` | 500×500, 121,058 B | `7104e162e0e5158336ac94dd895435c66f9c4cbf1a66719b6d1948eb11c2fbb3` | 128×128, 24,687 B | `e109d1430d6b81a49c0c28580bac4bd521c2c27410daa1ea13a61da382c33408` |
| BHA | Brighton | `BHA.png` | `331.png` | 500×500, 77,720 B | `b1a7041908644caca2c328a329aa8494d6c531cc32f4b11b7fceba43bc93e484` | 128×128, 17,856 B | `974ea758f2983c3b546db4ff5d7ffa650a27675c45b6fdbdc8d9f1c5be7cb433` |
| CHE | Chelsea | `CHE.png` | `363.png` | 500×500, 59,969 B | `6f14d86b5e35074e91462c7ede6e822f6a6c9f6cb723cd04ea6b8d36f2fa5392` | 128×128, 27,993 B | `d14dc9cc1c61674ef900b94fa0c907b2b8509cc98455d1901d8a9d51cd5a04a5` |
| COV | Coventry City | `COV.png` | `388.png` | 500×500, 147,977 B | `6959102823b1b8e3bad688a23bc24efed5cc02c606ff65a66a10c6ec15aa9b57` | 128×128, 26,871 B | `29d5e77eeaaa9444efd772b2f7fbccc2715632abee0d037f7c2d8259f8a9daaf` |
| CRY | Crystal Palace | `CRY.png` | `384.png` | 500×500, 80,572 B | `bc829f12cbd54aa1116888d68fda2cfe8bf4c16adea80033af748ca54a153920` | 128×128, 23,759 B | `006613315d33c6610573b7ecd25e6ea077720bf976802f09c0ddc5c0322870fe` |
| EVE | Everton | `EVE.png` | `368.png` | 500×500, 146,091 B | `eaedbe5e3b18ddef08c09d07fdca62bcac65165b7bb9af4780acce36841aee20` | 128×128, 23,473 B | `c6ab0b3c03f575f0ccc5d1ad75a018f5e9b76472a4d7bebee5f41c07289b88a6` |
| FUL | Fulham | `FUL.png` | `370.png` | 500×500, 16,696 B | `b9148eac6e2150c0498eca2924e755ae710d04d3fce66993050cf45942ca4a19` | 128×128, 10,431 B | `8d43c1e42b88f9947e601e7a5d3f64e40cee4c50fdc023095e6257cd11522765` |
| HUL | Hull City | `HUL.png` | `306.png` | 500×500, 75,616 B | `8147c0d4c418e56f133dcc79e38120cd742aab84e7ce72fa3c873f872100ab65` | 128×128, 21,654 B | `a7b85fb9b6f8b044c5106393d0161ee99872908064f9aac91e9cc96c3dd9ecd6` |
| IPS | Ipswich Town | `IPS.png` | `373.png` | 500×500, 22,565 B | `e253aeaf39ff7c9d19f91ce78464de947b275fdbea4bf595e602d42367cea1b7` | 128×128, 16,329 B | `ac534881443a59e71ce8d590569befa3972d0907dad3ac69bcaacaaad4af9ef0` |
| LEE | Leeds United | `LEE.png` | `357.png` | 500×500, 237,616 B | `69d5d4251e740fc8d525c3c967e817575b0ac2e2af7be03f23e40d494c383790` | 128×128, 24,512 B | `4b775c99d3be183c7e266af974aa0e704ea8c914eda9a250b864da7bc30f1190` |
| LIV | Liverpool | `LIV.png` | `364.png` | 500×500, 35,827 B | `9f2c56faf3631eb32fb5cccd84d31827ba38fcd9dd3280f597b221711a8797de` | 128×128, 11,607 B | `84ba508f4ec5c3d27ed9f9ede0f92450a70c4ca8f1704b3df1725d0fbd8df5cf` |
| MNC | Manchester City | `MNC.png` | `382.png` | 500×500, 130,387 B | `70e005bdab0ada41a153760398b4a2ef99f956bf9e72954686caa70da8c30c0b` | 128×128, 29,318 B | `23afacc746dd3719e91df6920e96cbed3bade9838e74ed4bab770ebd5fe300a1` |
| MUN | Manchester United | `MUN.png` | `360.png` | 500×500, 73,159 B | `03486cf5cf90d580d6132ab115cc747be7b2e3519fd6e08be56675cf5897f0b7` | 128×128, 25,689 B | `99a1d5bfe03e4bb3db7e10de8102261464bde70c11e8ea22ee307048c0f345fa` |
| NEW | Newcastle United | `NEW.png` | `361.png` | 500×500, 189,751 B | `5e926d9f8c18b1b20e2e86a830ad56d4a9094673f172c0f8fabf617917e1910d` | 128×128, 26,305 B | `41ff78caca80dc63cb811f01f01eb4a474eea689586d1ffc6423ceacdbf2acf0` |
| NFO | Nottingham Forest | `NFO.png` | `393.png` | 500×500, 20,645 B | `766868d667069609a8904ba1ec6a66f09fccfe9fbad21300791bf778dd9ddaae` | 128×128, 10,132 B | `8a364d3fed5027db795b6ec8f8897c48d4101282391c54eb79567f6f72d61007` |
| SUN | Sunderland | `SUN.png` | `366.png` | 500×500, 53,898 B | `aee718a79be592a8bb36ab68b0960a1dbb5763692f4d91c3f4249f95edbf19af` | 128×128, 19,576 B | `53110fcc65094c9a7753e45137ff90c8dd1169698df4b748db79e7e811c0d19b` |
| TOT | Tottenham Hotspur | `TOT.png` | `367.png` | 500×500, 26,224 B | `f66f956414b0fd99df6a7e29bed0bd8a849f11d41bd749a1e08ff8d032570d35` | 128×128, 8,298 B | `b826d2742886aa97470d797ef73dac704f26f8910404374afd9449dcbc587639` |

## Original badges

*Since D-46 (October 14, 2026) no badge displays by default: every team shows its official logo, and a team's badge shows only if that logo fails to load. The badge files and their records below are unchanged.*

Added October 9, 2026 under product-owner decision **D-22** (every team shows a mark). Badge files exist for **19 teams: ARI, ATL, BAL, BUF, CAR, CLE, DEN, DET, HOU, JAX, LV, MIA, MIN, NE, NYJ, PHI, SEA, TB and TEN**; **17 of them currently display the badge** (ARI, ATL, BAL, CAR, CLE, DEN, DET, HOU, JAX, LV, MIA, MIN, NE, PHI, SEA, TB and TEN). BUF and NYJ have reviewed official marks (above) that take precedence; their badge files stay registered as fallbacks. Files: `web/public/team-logos/badges/<code>.svg`; registry: `originalTeamBadges` in `web/src/teamLogoRegistry.js` (`rightsStatus: 'original'`).

- **Original GTL artwork.** One hand-written SVG crest geometry shared by all 19 badges: a flat top with a centred yard-line notch, chamfered shoulders and a soft keel, echoing the GTL fallback shield. It does not trace, adapt or imitate any NFL or team logo, helmet, animal, wordmark or emblem.
- **Content.** The team's abbreviation in bold condensed sans-serif (`'Barlow Condensed', Impact, 'Arial Narrow', sans-serif`, fitted with `textLength`), an inner field in the team's primary color and a band in its secondary color. A dark `#0B1020` outer outline plus a light `#F8FAFC` inner outline keeps the shape legible on both Midnight and Light canvases. Abbreviation text is white or `#0B1020`, whichever meets WCAG AA (at least 4.5:1) against the fill; the lowest is CAR at 4.70:1.
- **Team colors are factual color references.** Hex values are the teams' publicly known primary/secondary colors, used only to help players recognise the matchup. Colors and abbreviations are not official marks.
- **Not official marks; no endorsement.** The badges are not NFL or team logos and do not imply any NFL or team endorsement, sponsorship or affiliation. They are used only as small matchup identifiers beside the team name, never as GTL's app icon, advertising identity or merchandise.
- **Self-contained.** Each file is under 2 KB, `viewBox`-based, with no scripts, event handlers, embedded images, external references or web-font loading. `tests/team-marks.test.mjs` enforces this and that the 32 official logo files match the SHA-256 values in `sources.json`.

| Team | Primary | Secondary | Text |
| --- | --- | --- | --- |
| ARI | `#97233F` | `#FFB612` | white |
| ATL | `#A71930` | `#000000` | white |
| BAL | `#241773` | `#9E7C0C` | white |
| BUF | `#00338D` | `#C60C30` | white |
| CAR | `#0085CA` | `#101820` | `#0B1020` |
| CLE | `#311D00` | `#FF3C00` | white |
| DEN | `#FB4F14` | `#002244` | `#0B1020` |
| DET | `#0076B6` | `#B0B7BC` | white |
| HOU | `#03202F` | `#A71930` | white |
| JAX | `#006778` | `#D7A22A` | white |
| LV | `#000000` | `#A5ACAF` | white |
| MIA | `#008E97` | `#FC4C02` | `#0B1020` |
| MIN | `#4F2683` | `#FFC62F` | white |
| NE | `#002244` | `#C60C30` | white |
| NYJ | `#125740` | `#FFFFFF` | white |
| PHI | `#004C54` | `#A5ACAF` | white |
| SEA | `#002244` | `#69BE28` | white |
| TB | `#D50A0A` | `#34302B` | white |
| TEN | `#0C2340` | `#4B92DB` | white |

**Follow-up:** the official-mark rights check for the 17 badge-only teams could not be repeated from the October 9 cloud session because that environment's network policy blocks `commons.wikimedia.org`. It was repeated from the Mac mini on October 14, 2026 ([recheck](#october-14-2026-commons-recheck)), and no eligible primary mark was found. BUF and NYJ were resolved by the October 8 follow-up. If an eligible official mark is later verified for any of these teams, add the file, its `sources.json` record and its `approvedTeamLogos` entry together (`tests/team-marks.test.mjs` checks all three against each other); `teamMarks` then prefers the official mark over the badge automatically.

## Superseded public-domain register (D-22)

*Superseded by [D-46](#official-logos-d-46) on October 14, 2026. Kept as history: none of the files below ship any more; every team now uses its official logo above. The coverage, basis and asset records describe the state before D-46.*

### Implemented coverage before D-46

**All 32 teams now show a team mark in `TeamIdentity` (D-22, October 9, 2026).** Coverage as of October 14, 2026: **15 official, 17 original badges**; the [October 14 Commons recheck](#october-14-2026-commons-recheck) found no public-domain file of the current primary mark for any of the 17. 15 teams use reviewed official transparent marks (13 SVGs and two PNGs): the 13 recorded on October 8 plus the current Jets and Bills marks, which the October 8 follow-up found under different eligible Commons file records and which the October 9 reconciliation activates. These are small matchup identifiers, never Guess The Line branding, and the files are unchanged from their recorded Wikimedia Commons versions. The other 17 teams use [original Guess The Line badges](#original-badges), which are not official marks. The official mark always takes precedence when one is registered (BUF and NYJ keep their badge files registered as fallbacks that the official mark overrides); the abbreviation fallback remains only for an image that fails to load. Chicago uses its recognizable wishbone C secondary mark, not the bear-head primary.

The follow-up's open question, whether to revise the repository's verified-rights restriction for the remaining teams, was answered by D-22: those teams show original badges instead. No blanket NFL license or production release is inferred.

The earlier empty-registry result in `VISUAL_POLISH.md` is superseded for this subset. `web/src/teamLogoRegistry.js` now holds the eligible entries and `web/public/team-logos/sources.json` preserves individual file versions, hashes, source URLs and source credits.

### Basis and limited use (D-22)

Each included file's own Commons record labels the artwork public domain; this does not rely on an NFL data package's software license. Their separate trademark notices remain applicable. The app uses the marks only to identify teams in factual matchup/data displays, alongside team names, without claiming team/NFL endorsement or affiliation. No team marks become the app icon, advertising identity, merchandise, or original GTL artwork. No paid license or express NFL permission is claimed. Reassess before materially different uses or distribution in jurisdictions with different copyright treatment.

### Asset register (D-22)

All records below were read individually through Commons file metadata and their description pages. The exact downloaded versions are identified by source timestamp and SHA-256 in `sources.json`. No attribution is required by the recorded public-domain status; source credits are nevertheless retained for provenance. Source files are not recolored or redrawn. Original outlines and interior white fills remain part of the mark; their surrounding canvas is transparent.

#### BUF

- **Buffalo Bills** — `buf.png` (267,681 bytes), unchanged transparent PNG.
- [File and rights record](https://commons.wikimedia.org/wiki/File:Buffalo_Bills_logo_1974-present.png); description revision `1249487431`; file timestamp `2026-07-06T21:40:58Z`.
- Copyright record: public domain in the United States (`PD-US-no-notice`); separate trademark notice. The source notes possible different treatment outside the United States.
- Source credit: Stevens Wright; Buffalo Bills. The recorded PNG was rasterized from the official NFL mark and matches its current outline.
- SHA-256: `8613cca9fa8ab79b4a32f775ab4521a5cc767bd1e34633531034461b6fcb00dd`.
- The separate Commons SVG's vectorization carries CC BY-SA 4.0; that version is not distributed here.

#### NYJ

- **New York Jets** — `nyj.svg` (3,235 bytes), unchanged current green 2024 mark.
- [File and rights record](https://commons.wikimedia.org/wiki/File:New_York_Jets_2024.svg); description revision `951713167`; file timestamp `2024-04-16T23:56:14Z`.
- Copyright record: public domain (`PD-logo`); separate trademark notice.
- Source credit: New York Jets. This is the current jet wordmark, not the earlier 2019 wordmark considered below.
- SHA-256: `afb3e75c79a8ed9a784f493a1ec1f6be1fcbbcaed50a250a3d09e44b4fbf8a2f`.

#### CHI

- **Chicago Bears** — `chi.svg` (10,666 bytes).
- [File and rights record](https://commons.wikimedia.org/wiki/File:Chicago_Bears_logo.svg); description revision `1122523372`.
- Copyright record: public domain. Separate source restriction: trademarked.
- Source credit: Chicago Bears

Uploaded by Opertinicy at en.wikipedia.
- SHA-256: `199a573e4b11fb7fbd37557c98598f1426304e60ad60742aaf4586f93c22f5a8`.

#### CIN

- **Cincinnati Bengals** — `cin.svg` (2,002 bytes).
- [File and rights record](https://commons.wikimedia.org/wiki/File:Cincinnati_Bengals_logo.svg); description revision `1167753846`.
- Copyright record: public domain. Separate source restriction: trademarked.
- Source credit: Cincinnati Bengals.
- SHA-256: `ea9dd831e4b669839eaf2379ae6ea2f14e11ba744075e70e010f8720db1f1593`.

#### DAL

- **Dallas Cowboys** — `dal.svg` (397 bytes).
- [File and rights record](https://commons.wikimedia.org/wiki/File:Dallas_Cowboys.svg); description revision `1154117975`.
- Copyright record: public domain. Separate source restriction: trademarked.
- Source credit: Opertinicy.
- SHA-256: `ec3d0499cd11ba6cf60cca8a37bc188f64794cfce9f51544d1526971a75e7bb2`.

#### GB

- **Green Bay Packers** — `gb.svg` (1,174 bytes).
- [File and rights record](https://commons.wikimedia.org/wiki/File:Green_Bay_Packers_logo.svg); description revision `1132079923`.
- Copyright record: public domain. Separate source restriction: trademarked.
- Source credit: This vector image was created with Adobe Illustrator by Daris Bayliss, and then manually edited by Green Bay Packers..
- SHA-256: `8c15f9d8e337f5d2244b85a5ead37b9a76a03e68c40bb7a7026a52578d5f95a8`.

#### IND

- **Indianapolis Colts** — `ind.svg` (4,310 bytes).
- [File and rights record](https://commons.wikimedia.org/wiki/File:Indianapolis_Colts_logo.svg); description revision `1132048398`.
- Copyright record: public domain. Separate source restriction: trademarked.
- Source credit: Indianapolis Colts.
- SHA-256: `0b2f28f6f9b98f299c7a9939f111090bb8a0ae748a3ba046649ce9ef64712324`.

#### KC

- **Kansas City Chiefs** — `kc.svg` (6,593 bytes).
- [File and rights record](https://commons.wikimedia.org/wiki/File:Kansas_City_Chiefs_logo.svg); description revision `1250223030`.
- Copyright record: public domain. Separate source restriction: trademarked.
- Source credit: Kansas City Chiefs.
- SHA-256: `37babd334452218aff6c59474c1e7faae63678df2e9c30af7222899be2ed088a`.

#### LAC

- **Los Angeles Chargers** — `lac.svg` (1,275 bytes).
- [File and rights record](https://commons.wikimedia.org/wiki/File:Los_Angeles_Chargers_logo.svg); description revision `1216987325`.
- Copyright record: public domain. Separate source restriction: trademarked.
- Source credit: Los Angeles Chargers.
- SHA-256: `ac4f7ca053eccdc815090bdf1b3448f00027176474845fee4d2df3c156dfeb52`.

#### NO

- **New Orleans Saints** — `no.svg` (5,132 bytes).
- [File and rights record](https://commons.wikimedia.org/wiki/File:New_Orleans_Saints_logo.svg); description revision `1074491865`.
- Copyright record: public domain. Separate source restriction: trademarked.
- Source credit: New Orleans Saints.
- SHA-256: `d60da303f4cbb557e5973aa0ac30c71de0505927b5da3f5180acc5dd33e63be4`.

#### NYG

- **New York Giants** — `nyg.svg` (3,496 bytes).
- [File and rights record](https://commons.wikimedia.org/wiki/File:New_York_Giants_logo.svg); description revision `1132049031`.
- Copyright record: public domain. Separate source restriction: trademarked.
- Source credit: Opertinicy at en.wikipedia.
- SHA-256: `6abe4c098c4f0747e794597fc19944d45217805c9b2a2118c9b432d0468666be`.

#### PIT

- **Pittsburgh Steelers** — `pit.svg` (5,479 bytes).
- [File and rights record](https://commons.wikimedia.org/wiki/File:Pittsburgh_Steelers_logo.svg); description revision `1074473597`.
- Copyright record: public domain. Separate source restriction: trademarked.
- Source credit: Brighterorange.
- SHA-256: `d5bf31a941253c691cf1961bc4c0afcfb2c1f21f91a337827259dd5fe9b4a27f`.

#### SF

- **San Francisco 49ers** — `sf.svg` (3,571 bytes).
- [File and rights record](https://commons.wikimedia.org/wiki/File:San_Francisco_49ers_logo.svg); description revision `1115345778`.
- Copyright record: public domain. Separate source restriction: trademarked.
- Source credit: San Francisco 49ers, User:Stepshep.
- SHA-256: `d3ae8fd9ca796f940e6215df987a2949bdc5825a23f589105afee71bef3c7d9d`.

#### WAS

- **Washington Commanders** — `was.svg` (822 bytes).
- [File and rights record](https://commons.wikimedia.org/wiki/File:Washington_Commanders_logo.svg); description revision `1251611333`.
- Copyright record: public domain. Separate source restriction: trademarked.
- Source credit: Washington Commanders.
- SHA-256: `b8aea1084019477c8a2d839e200f9ef83f54e1ff5c655a42b435d59b44c7eece`.

#### LAR

- **Los Angeles Rams** — `lar.png` (279,597 bytes).
- [File and rights record](https://commons.wikimedia.org/wiki/File:Los_Angeles_Rams_Logo.png); description revision `1242980533`.
- Copyright record: public domain. Separate source restriction: trademarked.
- Source credit: Los Angeles Rams. Original RGBA PNG, unchanged.
- [The team's April 16, 2026 release](https://www.therams.com/news/rams-unveil-uniform-brand-refresh-ahead-of-2026-season) confirms the current solid-color LA monogram refresh.
- SHA-256: `3607621c4e06d10eff663cc8ebb62fca84a06fb12da4414d3a9c734179d7eb7a`.

### Remaining official-mark coverage before D-46

The 17 teams below display original GTL badges (see [Original badges](#original-badges)); this section concerns only whether an official mark could later replace a badge.

File-level records for **ARI, ATL, BAL, CAR, CLE, DEN, DET, HOU, JAX, LV, MIA, MIN, NE, PHI, SEA, TB and TEN** label their artwork copyrighted and show Wikipedia-specific fair-use rationales. Those rationales do not themselves grant redistribution permission to this app. `remaining-sources.json` preserves the exact earlier page revisions, including the superseded BUF/NYJ checks, and lists the 17 still missing teams. No artwork for these 17 teams is activated. Official-source candidates and current-logo comparisons are kept only in the ignored local review directory.

The old Rams SVG filename in nflverse metadata is stale. The replacement above was checked separately and uses the current 2026 mark. The source remains a 279,597-byte PNG to avoid altering it; all 12 SVGs together total about 44 KB.

For each remaining team, the next eligible input is either a file-specific public-domain/free-artwork record covering the actual mark, or the rightsholder's applicable permission for this small team-identification use. This is an asset-level gap, not a claim that all team references require a paid license. Do not silently use an unrelated historic logo, an unverified recoloring, a software library's MIT notice, or an ESPN/CDN URL as a substitute.

The earlier 2019 Jets wordmark was not substituted. The current 2024 mark above was found in the follow-up and is now active.

#### October 14, 2026 Commons recheck

Rechecked from the Mac mini, which has Commons access, through the Commons API. Each team's File-namespace search results, title-prefix listing, `<Team> logos` category and `Category:Logos of National Football League teams` were reviewed, and each en.wikipedia primary-logo filename was looked up on Commons. **None of those 17 filenames exists on Commons.** The Commons log shows two earlier uploads under those names that were deleted: `Miami Dolphins logo.svg` (January 27, 2025, "No permission") and `New England Patriots logo.svg` (January 5, 2012, copyright violation, "Sport club logo. Not text only"). The en.wikipedia records were read again and still say copyrighted and fair use; the revisions are in `remaining-sources.json`. Candidate Commons records were read individually (imageinfo, extmetadata and the latest description revision). Commons does hold public-domain (`PD-textlogo`) wordmarks for all 17 teams and letter or alternate marks for four of them, but the rule for this register is the team's current **primary** mark, so none of them was activated. Nothing was downloaded, and coverage stays at 15 official marks and 17 badges.

| Team | Result | Reason (Commons record) |
| --- | --- | --- |
| ARI | keeps badge | `Arizona Cardinals logo (2005).png` (rev `801428135`, `PD-textlogo`) is, per its own description, the wordmark logo used since 2005, not the cardinal-head primary. The only other public-domain file is a wordmark. |
| ATL | keeps badge | Only wordmarks (`Atlanta Falcons wordmark.svg` and colour variants) are public domain; the falcon primary is fair use on en.wikipedia only. |
| BAL | keeps badge | `Baltimore Ravens B.png` (rev `1117313713`, `PD-textlogo`) is, per its own description, the alternate B logo. The other public-domain file is a wordmark, and the raven-head primary is fair use only. |
| CAR | keeps badge | Only wordmarks are public domain; the panther-head primary is fair use only. |
| CLE | keeps badge | `Cleveland Browns B.svg` (rev `1121194696`, `PD-textlogo`) is the letter-B secondary mark, and `Cleveland Browns (c. 2006).png` (rev `1121194754`, `PD-textlogo`) is a wordmark. The helmet primary is fair use only. |
| DEN | keeps badge | Only wordmarks are public domain; the horse-head primary is fair use only. |
| DET | keeps badge | Only wordmarks and a 1961–1969 logo exist; the current lion primary is fair use only. |
| HOU | keeps badge | Only wordmarks (including the 2024 wordmark) are public domain; the bull-head primary is fair use only. |
| JAX | keeps badge | Only wordmarks are public domain; the jaguar-head primary is fair use only. |
| LV | keeps badge | Only a wordmark is public domain; the shield primary is fair use only. |
| MIA | keeps badge | Only wordmarks are public domain; the dolphin primary is fair use only, and a Commons upload under that name was deleted for lack of permission. |
| MIN | keeps badge | `Minnesota Vikings V logo.png` (rev `372846498`, `PD-textlogo`) is, per its own description, the alternative logo used since 1998. The Viking-head primary is fair use only. |
| NE | keeps badge | `New England Patriots NE logo.png` (rev `1151524577`, `PD-textlogo`) is a letter mark, not the primary. The primary was deleted from Commons in 2012 as a copyright violation. |
| PHI | keeps badge | Only wordmarks (including the 2022–present wordmark) are public domain; the eagle-head primary is fair use only. |
| SEA | keeps badge | Only wordmarks are public domain; the seahawk-head primary is fair use only. |
| TB | keeps badge | Only wordmarks are public domain; the flag primary is fair use only. |
| TEN | keeps badge | `Tennessee Titans 2026 leaked logo.svg` (rev `1209625381`, `PD-textlogo`) is a third-party vectorization of an allegedly leaked image sourced from a Reddit preview. It is not the team's published file, and its own record says "if real". The official 2026 primary is fair use only (`Tennessee Titans Logo 2026.svg`, en.wikipedia rev `1344542162`). |

The secondary and letter marks above (BAL B, CLE B, MIN V, NE letter mark) are public domain on Commons. If Sean ever wants them, as with Chicago's wishbone C, that needs a product decision first. None of them is used here.

### Follow-up 15-team validation

The isolated live component review passed all six combinations of **320px, 390px and 1440px in Light and Dark**. All 15 registered files loaded, canvas inspection confirmed transparency, accessible team names and existing aliases remained intact, and unknown teams plus an intentionally failed Dallas image retained their fallback. No horizontal overflow, external requests or page errors occurred. The review server denied repository/private routes. Dark 320px and Light 1440px screenshots were visually reviewed.

Evidence: `.local/team-logo-update-qa/results.json` and `logos-{theme}-{width}.png`. The reusable `build.mjs` and `qa.mjs` in that directory read the actual component, registry, public artwork and brand tokens. This verifies local rendering on the October 8 Mac mini checkout, before the D-22 badges existed; it is not a publication claim.

### Earlier 13-team validation

Local component verification passed in Light and Dark at **320px and 1440px**, with screenshots reviewed. All 13 assets loaded, all accessible labels were present, and there was no horizontal overflow or external image request. Alpha-channel inspection confirmed transparent pixels around the artwork in all 13 files (the actual mark may reach a bounding-box corner; a transparent canvas does not require every corner pixel to be empty). Both an unknown team and an intentionally failed Dallas request rendered the existing fallback without losing the team name.

The downloaded SVGs were parsed and checked for scripts, event handlers, embedded HTML/images, animation, external rendering references and entities. SHA-1 matches the source's own file checksum; SHA-256 is preserved locally. A code bundle compiled successfully for the isolated component review. This does not replace the primary agent's full-app checks or prove a production release.

Evidence: `.local/team-logo-qa/results.json`, `.local/previews/team-logos-light-1440.png`, `.local/previews/team-logos-dark-320.png` and the reciprocal Light/Dark viewport pair. The temporary review server was loopback-only and served only the review bundle and public logo assets. Deployment remains the primary agent's responsibility.
