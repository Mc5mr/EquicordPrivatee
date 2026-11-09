# Performance

Fixes the places Discord gets stuck.

## Scroll past blocked messages

Scroll up in a chat full of blocked or ignored messages, and Discord can sit on its grey
loading placeholder forever. Nothing is broken. It is loading, just in a way you can't see:

1. Discord loads older messages as you reach the top, then measures how much taller the list
   got. If it grew by less than 100 pixels, it decides the load showed nothing new and waits for
   you to scroll again.
2. Blocked and ignored messages all fold into one "N blocked messages" row, so a page of them
   barely changes the height. Measured: 28 more blocked messages made the list 52 px taller.
3. Discord keeps only 60 messages loaded. As it loads older ones it drops newer ones, so the
   row reads **60 blocked messages** however far back you are.

So every scroll pages a little further back, nothing on screen changes, and it looks stuck.

With Performance on, one scroll keeps loading by itself, a page at a time, for as long as each page is
all hidden messages. As soon as a page has something to show, Discord takes over as it always
does.

> [!NOTE]
> It only loads because you scrolled, and at most 20 pages (560 messages) per scroll, so it
> never runs through a whole history on its own.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Scroll past blocked messages | On | Keep loading through blocked and ignored messages |

