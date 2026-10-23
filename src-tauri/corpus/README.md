# Detection corpus

Labelled sermon transcripts that score scripture detection. `cargo test corpus -- --nocapture`
prints recall, precision and the share of automatically staged verses that were right, and
fails the build if recall drops below 95% or automatic precision below 99%.

Each file in `detection/` is one case: transcript segments in the order they were spoken,
each with the references actually said in it. Segments are detected with the same sermon
context the app carries, so "verse 17" after "John 3:16" counts as John 3:17.

```json
{
  "id": "en-sermon-flow",
  "language": "en",
  "source": "Where the transcript came from, and the consent it was given under.",
  "segments": [
    { "text": "Our text this morning is from Joshua chapter 14.", "expect": ["Joshua 14"] },
    { "text": "Verse 12 says, give me this mountain.", "expect": ["Joshua 14:12"] }
  ]
}
```

Label what was said, not what the detector found. A reference the engine misheard
("MasterChef 5" for Matthew 5:14) is still labelled; it is a miss worth seeing.

## Adding a real service

1. After the service, choose **Export for accuracy check** on Live Listen. The file labels
   each segment with the verses the operator put on screen, and lists the ones suggested
   but never shown (`unconfirmed`) or dismissed (`rejected`).
2. Read it through: fix `expect` where the operator showed a verse late or missed one, then
   delete `unconfirmed` and `rejected` and set `"reviewed": true`. Unreviewed files fail the test.
3. Only add a transcript the church has agreed to share, and say so in `source`.
