# Architecture rules

- Assessment scoring stays in `assessmentParser.ts`; bare Forms points are awarded marks only, and percentage calculation requires explicit maximum marks so question counts cannot silently become mark totals.
- Assessment question uploads use position-ordered PDF text before AI fallback; preserve every numbered question and use correctIndex -1 for unmarked answers so unknown keys cannot mark a candidate wrong.