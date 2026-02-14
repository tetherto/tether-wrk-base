#!/bin/bash
set -e

include_test=false
while [ $# -ne 0 ]; do
  case "$1" in
    -t | --test ) include_test=true ;;
  esac
  shift
done

find config -type f -name "*.example" -print0 | while IFS= read -r -d '' file; do
  new_name=$(echo "$file" | sed -E -e 's/\.example$//')
  echo "$file -> $new_name"
  cp "$file" "$new_name"

  if [ "$include_test" = true ]; then
    dir_name=$(dirname "$new_name")
    base_name=$(basename "$new_name")
    test_name="$dir_name/test.$base_name"
    echo "$file -> $test_name"
    cp "$file" "$test_name"
  fi
done
