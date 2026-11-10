# Architecture rules

- Assessment scoring stays in `assessmentParser.ts`; bare Forms points are awarded marks only, and percentage calculation requires explicit maximum marks so question counts cannot silently become mark totals.