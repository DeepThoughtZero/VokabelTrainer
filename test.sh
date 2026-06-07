#!/bin/bash
test_cases=(
  "(to) explain sth. to sb."
  "I'd like... (= I would like...)"
  "Give me a break! (infml)"
  "pound (£)"
  "quantity, pl quantities"
  "strawberry, pl strawberries"
  "chips (pl)"
  "tooth (pl teeth)"
  "(to) be/feel bored"
)

for text in "${test_cases[@]}"; do
  orig="$text"
  text=$(echo "$text" | sed -E 's/\(to\)\s*/to /g')
  text=$(echo "$text" | sed -E 's/\([^)]*\)//g')
  text=$(echo "$text" | sed 's/\bsth\./something/g' | sed 's/\bsb\./somebody/g')
  text=$(echo "$text" | sed -E 's/\bpl\b/plural/g')
  text=$(echo "$text" | sed 's/\// or /g')
  text=$(echo "$text" | sed -E 's/ +/ /g' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
  echo "$orig -> $text"
done
