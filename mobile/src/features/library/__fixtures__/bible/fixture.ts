// TEMPORARY fixture of the reader: a few complete chapters of the World English Bible, Catholic edition, in the encoding of
// bible/textTypes.ts (Psalms 1, 23 and 121, Genesis 1, John 1, Baruch 6, Sirach 11 with its joined label, Song of Songs 1), made from the
// source zip. Replaced by the real text of the data branch (assets/bible/webc), together with the stubs text.ts and searchText.ts.
import type { BookText } from '../../bible/textTypes';

export const FIXTURE_BOOKS: Record<string, BookText> = {
  "PSA": {
    "code": "PSA",
    "name": "Psalms",
    "chapters": [
      {
        "c": 1,
        "verses": [
          {
            "n": "1",
            "t": "\tBlessed is the man who doesn’t walk in the counsel of the wicked,\n\t\tnor stand on the path of sinners,\n\t\tnor sit in the seat of scoffers;",
            "h": "BOOK 1"
          },
          {
            "n": "2",
            "t": "\tbut his delight is in the LORD’s law.\n\t\tOn his law he meditates day and night."
          },
          {
            "n": "3",
            "t": "\tHe will be like a tree planted by the streams of water,\n\t\tthat produces its fruit in its season,\n\t\twhose leaf also does not wither.\n\t\tWhatever he does shall prosper."
          },
          {
            "n": "4",
            "t": "\tThe wicked are not so,\n\t\tbut are like the chaff which the wind drives away."
          },
          {
            "n": "5",
            "t": "\tTherefore the wicked shall not stand in the judgment,\n\t\tnor sinners in the congregation of the righteous."
          },
          {
            "n": "6",
            "t": "\tFor the LORD knows the way of the righteous,\n\t\tbut the way of the wicked shall perish."
          }
        ]
      },
      {
        "c": 23,
        "verses": [
          {
            "n": "1",
            "t": "\tThe LORD is my shepherd;\n\t\tI shall lack nothing."
          },
          {
            "n": "2",
            "t": "\tHe makes me lie down in green pastures.\n\t\tHe leads me beside still waters."
          },
          {
            "n": "3",
            "t": "\tHe restores my soul.\n\t\tHe guides me in the paths of righteousness for his name’s sake."
          },
          {
            "n": "4",
            "t": "\tEven though I walk through the valley of the shadow of death,\n\t\tI will fear no evil, for you are with me.\n\tYour rod and your staff,\n\t\tthey comfort me."
          },
          {
            "n": "5",
            "t": "\tYou prepare a table before me\n\t\tin the presence of my enemies.\n\tYou anoint my head with oil.\n\t\tMy cup runs over."
          },
          {
            "n": "6",
            "t": "\tSurely goodness and loving kindness shall follow me all the days of my life,\n\t\tand I will dwell in the LORD’s house forever."
          }
        ],
        "title": "A Psalm by David."
      },
      {
        "c": 121,
        "verses": [
          {
            "n": "1",
            "t": "\tI will lift up my eyes to the hills.\n\t\tWhere does my help come from?"
          },
          {
            "n": "2",
            "t": "\tMy help comes from the LORD,\n\t\twho made heaven and earth."
          },
          {
            "n": "3",
            "t": "\tHe will not allow your foot to be moved.\n\t\tHe who keeps you will not slumber.",
            "b": true
          },
          {
            "n": "4",
            "t": "\tBehold, he who keeps Israel\n\t\twill neither slumber nor sleep."
          },
          {
            "n": "5",
            "t": "\tThe LORD is your keeper.\n\t\tThe LORD is your shade on your right hand."
          },
          {
            "n": "6",
            "t": "\tThe sun will not harm you by day,\n\t\tnor the moon by night."
          },
          {
            "n": "7",
            "t": "\tThe LORD will keep you from all evil.\n\t\tHe will keep your soul."
          },
          {
            "n": "8",
            "t": "\tThe LORD will keep your going out and your coming in,\n\t\tfrom this time forward, and forever more."
          }
        ],
        "title": "A Song of Ascents."
      }
    ]
  },
  "GEN": {
    "code": "GEN",
    "name": "Genesis",
    "chapters": [
      {
        "c": 1,
        "verses": [
          {
            "n": "1",
            "t": "In the beginning, God created the heavens and the earth.",
            "p": true
          },
          {
            "n": "2",
            "t": "The earth was formless and empty. Darkness was on the surface of the deep and God’s Spirit was hovering over the surface of the waters."
          },
          {
            "n": "3",
            "t": "God said, “Let there be light,” and there was light.",
            "p": true
          },
          {
            "n": "4",
            "t": "God saw the light, and saw that it was good. God divided the light from the darkness."
          },
          {
            "n": "5",
            "t": "God called the light “day”, and the darkness he called “night”. There was evening and there was morning, the first day."
          },
          {
            "n": "6",
            "t": "God said, “Let there be an expanse in the middle of the waters, and let it divide the waters from the waters.”",
            "p": true
          },
          {
            "n": "7",
            "t": "God made the expanse, and divided the waters which were under the expanse from the waters which were above the expanse; and it was so."
          },
          {
            "n": "8",
            "t": "God called the expanse “sky”. There was evening and there was morning, a second day."
          },
          {
            "n": "9",
            "t": "God said, “Let the waters under the sky be gathered together to one place, and let the dry land appear;” and it was so.",
            "p": true
          },
          {
            "n": "10",
            "t": "God called the dry land “earth”, and the gathering together of the waters he called “seas”. God saw that it was good."
          },
          {
            "n": "11",
            "t": "God said, “Let the earth yield grass, herbs yielding seeds, and fruit trees bearing fruit after their kind, with their seeds in it, on the earth;” and it was so."
          },
          {
            "n": "12",
            "t": "The earth yielded grass, herbs yielding seed after their kind, and trees bearing fruit, with their seeds in it, after their kind; and God saw that it was good."
          },
          {
            "n": "13",
            "t": "There was evening and there was morning, a third day."
          },
          {
            "n": "14",
            "t": "God said, “Let there be lights in the expanse of the sky to divide the day from the night; and let them be for signs to mark seasons, days, and years;",
            "p": true
          },
          {
            "n": "15",
            "t": "and let them be for lights in the expanse of the sky to give light on the earth;” and it was so."
          },
          {
            "n": "16",
            "t": "God made the two great lights: the greater light to rule the day, and the lesser light to rule the night. He also made the stars."
          },
          {
            "n": "17",
            "t": "God set them in the expanse of the sky to give light to the earth,"
          },
          {
            "n": "18",
            "t": "and to rule over the day and over the night, and to divide the light from the darkness. God saw that it was good."
          },
          {
            "n": "19",
            "t": "There was evening and there was morning, a fourth day."
          },
          {
            "n": "20",
            "t": "God said, “Let the waters abound with living creatures, and let birds fly above the earth in the open expanse of the sky.”",
            "p": true
          },
          {
            "n": "21",
            "t": "God created the large sea creatures and every living creature that moves, with which the waters swarmed, after their kind, and every winged bird after its kind. God saw that it was good."
          },
          {
            "n": "22",
            "t": "God blessed them, saying, “Be fruitful, and multiply, and fill the waters in the seas, and let birds multiply on the earth.”"
          },
          {
            "n": "23",
            "t": "There was evening and there was morning, a fifth day."
          },
          {
            "n": "24",
            "t": "God said, “Let the earth produce living creatures after their kind, livestock, creeping things, and animals of the earth after their kind;” and it was so.",
            "p": true
          },
          {
            "n": "25",
            "t": "God made the animals of the earth after their kind, and the livestock after their kind, and everything that creeps on the ground after its kind. God saw that it was good."
          },
          {
            "n": "26",
            "t": "God said, “Let’s make man in our image, after our likeness. Let them have dominion over the fish of the sea, and over the birds of the sky, and over the livestock, and over all the earth, and over every creeping thing that creeps on the earth.”",
            "p": true
          },
          {
            "n": "27",
            "t": "God created man in his own image. In God’s image he created him; male and female he created them."
          },
          {
            "n": "28",
            "t": "God blessed them. God said to them, “Be fruitful, multiply, fill the earth, and subdue it. Have dominion over the fish of the sea, over the birds of the sky, and over every living thing that moves on the earth.”"
          },
          {
            "n": "29",
            "t": "God said, “Behold, I have given you every herb yielding seed, which is on the surface of all the earth, and every tree, which bears fruit yielding seed. It will be your food."
          },
          {
            "n": "30",
            "t": "To every animal of the earth, and to every bird of the sky, and to everything that creeps on the earth, in which there is life, I have given every green herb for food;” and it was so."
          },
          {
            "n": "31",
            "t": "God saw everything that he had made, and, behold, it was very good. There was evening and there was morning, a sixth day.",
            "p": true
          }
        ]
      }
    ]
  },
  "JHN": {
    "code": "JHN",
    "name": "John",
    "chapters": [
      {
        "c": 1,
        "verses": [
          {
            "n": "1",
            "t": "In the beginning was the Word, and the Word was with God, and the Word was God.",
            "p": true
          },
          {
            "n": "2",
            "t": "The same was in the beginning with God."
          },
          {
            "n": "3",
            "t": "All things were made through him. Without him, nothing was made that has been made."
          },
          {
            "n": "4",
            "t": "In him was life, and the life was the light of men."
          },
          {
            "n": "5",
            "t": "The light shines in the darkness, and the darkness hasn’t overcome it."
          },
          {
            "n": "6",
            "t": "There came a man sent from God, whose name was John.",
            "p": true
          },
          {
            "n": "7",
            "t": "The same came as a witness, that he might testify about the light, that all might believe through him."
          },
          {
            "n": "8",
            "t": "He was not the light, but was sent that he might testify about the light."
          },
          {
            "n": "9",
            "t": "The true light that enlightens everyone was coming into the world."
          },
          {
            "n": "10",
            "t": "He was in the world, and the world was made through him, and the world didn’t recognize him.",
            "p": true
          },
          {
            "n": "11",
            "t": "He came to his own, and those who were his own didn’t receive him."
          },
          {
            "n": "12",
            "t": "But as many as received him, to them he gave the right to become God’s children, to those who believe in his name:"
          },
          {
            "n": "13",
            "t": "who were born, not of blood, nor of the will of the flesh, nor of the will of man, but of God."
          },
          {
            "n": "14",
            "t": "The Word became flesh and lived among us. We saw his glory, such glory as of the only born Son of the Father, full of grace and truth.",
            "p": true
          },
          {
            "n": "15",
            "t": "John testified about him. He cried out, saying, “This was he of whom I said, ‘He who comes after me has surpassed me, for he was before me.’”"
          },
          {
            "n": "16",
            "t": "From his fullness we all received grace upon grace."
          },
          {
            "n": "17",
            "t": "For the law was given through Moses. Grace and truth were realized through Jesus Christ."
          },
          {
            "n": "18",
            "t": "No one has seen God at any time. The only born Son, who is in the bosom of the Father, has declared him."
          },
          {
            "n": "19",
            "t": "This is John’s testimony, when the Jews sent priests and Levites from Jerusalem to ask him, “Who are you?”",
            "p": true
          },
          {
            "n": "20",
            "t": "He declared, and didn’t deny, but he declared, “I am not the Christ.”",
            "p": true
          },
          {
            "n": "21",
            "t": "They asked him, “What then? Are you Elijah?”\nHe said, “I am not.”\n“Are you the prophet?”\nHe answered, “No.”",
            "p": true
          },
          {
            "n": "22",
            "t": "They said therefore to him, “Who are you? Give us an answer to take back to those who sent us. What do you say about yourself?”",
            "p": true
          },
          {
            "n": "23",
            "t": "He said, “I am the voice of one crying in the wilderness, ‘Make straight the way of the Lord,’ as Isaiah the prophet said.”",
            "p": true
          },
          {
            "n": "24",
            "t": "The ones who had been sent were from the Pharisees.",
            "p": true
          },
          {
            "n": "25",
            "t": "They asked him, “Why then do you baptize if you are not the Christ, nor Elijah, nor the prophet?”"
          },
          {
            "n": "26",
            "t": "John answered them, “I baptize in water, but among you stands one whom you don’t know.",
            "p": true
          },
          {
            "n": "27",
            "t": "He is the one who comes after me, who is preferred before me, whose sandal strap I’m not worthy to loosen.”"
          },
          {
            "n": "28",
            "t": "These things were done in Bethany beyond the Jordan, where John was baptizing."
          },
          {
            "n": "29",
            "t": "The next day, he saw Jesus coming to him, and said, “Behold, the Lamb of God, who takes away the sin of the world!",
            "p": true
          },
          {
            "n": "30",
            "t": "This is he of whom I said, ‘After me comes a man who is preferred before me, for he was before me.’"
          },
          {
            "n": "31",
            "t": "I didn’t know him, but for this reason I came baptizing in water, that he would be revealed to Israel.”"
          },
          {
            "n": "32",
            "t": "John testified, saying, “I have seen the Spirit descending like a dove out of heaven, and it remained on him."
          },
          {
            "n": "33",
            "t": "I didn’t recognize him, but he who sent me to baptize in water said to me, ‘On whomever you will see the Spirit descending and remaining on him is he who baptizes in the Holy Spirit.’"
          },
          {
            "n": "34",
            "t": "I have seen and have testified that this is the Son of God.”"
          },
          {
            "n": "35",
            "t": "Again, the next day, John was standing with two of his disciples,",
            "p": true
          },
          {
            "n": "36",
            "t": "and he looked at Jesus as he walked, and said, “Behold, the Lamb of God!”"
          },
          {
            "n": "37",
            "t": "The two disciples heard him speak, and they followed Jesus."
          },
          {
            "n": "38",
            "t": "Jesus turned and saw them following, and said to them, “What are you looking for?”\nThey said to him, “Rabbi” (which is to say, being interpreted, Teacher), “where are you staying?”"
          },
          {
            "n": "39",
            "t": "He said to them, “Come and see.”\nThey came and saw where he was staying, and they stayed with him that day. It was about the tenth hour.",
            "p": true
          },
          {
            "n": "40",
            "t": "One of the two who heard John and followed him was Andrew, Simon Peter’s brother."
          },
          {
            "n": "41",
            "t": "He first found his own brother, Simon, and said to him, “We have found the Messiah!” (which is, being interpreted, Christ)."
          },
          {
            "n": "42",
            "t": "He brought him to Jesus. Jesus looked at him and said, “You are Simon the son of Jonah. You shall be called Cephas” (which is by interpretation, Peter)."
          },
          {
            "n": "43",
            "t": "On the next day, he was determined to go out into Galilee, and he found Philip. Jesus said to him, “Follow me.”",
            "p": true
          },
          {
            "n": "44",
            "t": "Now Philip was from Bethsaida, the city of Andrew and Peter."
          },
          {
            "n": "45",
            "t": "Philip found Nathanael, and said to him, “We have found him of whom Moses in the law and also the prophets, wrote: Jesus of Nazareth, the son of Joseph.”"
          },
          {
            "n": "46",
            "t": "Nathanael said to him, “Can any good thing come out of Nazareth?”\nPhilip said to him, “Come and see.”",
            "p": true
          },
          {
            "n": "47",
            "t": "Jesus saw Nathanael coming to him, and said about him, “Behold, an Israelite indeed, in whom is no deceit!”",
            "p": true
          },
          {
            "n": "48",
            "t": "Nathanael said to him, “How do you know me?”\nJesus answered him, “Before Philip called you, when you were under the fig tree, I saw you.”",
            "p": true
          },
          {
            "n": "49",
            "t": "Nathanael answered him, “Rabbi, you are the Son of God! You are King of Israel!”",
            "p": true
          },
          {
            "n": "50",
            "t": "Jesus answered him, “Because I told you, ‘I saw you underneath the fig tree,’ do you believe? You will see greater things than these!”",
            "p": true
          },
          {
            "n": "51",
            "t": "He said to him, “Most certainly, I tell you all, hereafter you will see heaven opened, and the angels of God ascending and descending on the Son of Man.”"
          }
        ]
      }
    ]
  },
  "BAR": {
    "code": "BAR",
    "name": "Baruch",
    "chapters": [
      {
        "c": 6,
        "verses": [
          {
            "n": "1",
            "t": "A copy of a letter that Jeremy sent to those who were to be led captives into Babylon by the king of the Babylonians, to give them the message that God commanded him.",
            "p": true,
            "h": "The Letter of Jeremy (Jeremiah)"
          },
          {
            "n": "2",
            "t": "Because of the sins which you have committed before God, you will be led away captives to Babylon by Nabuchodonosor king of the Babylonians.",
            "p": true
          },
          {
            "n": "3",
            "t": "So when you come to Babylon, you will remain there many years, and for a long season, even for seven generations. After that, I will bring you out peacefully from there."
          },
          {
            "n": "4",
            "t": "But now you will see in Babylon gods of silver, gold, and wood carried on shoulders, which cause the nations to fear."
          },
          {
            "n": "5",
            "t": "Beware therefore that you in no way become like these foreigners. Don’t let fear take hold of you because of them when you see the multitude before them and behind them, worshiping them."
          },
          {
            "n": "6",
            "t": "But say in your hearts, “O Lord, we must worship you.”"
          },
          {
            "n": "7",
            "t": "For my angel is with you, and I myself care for your souls."
          },
          {
            "n": "8",
            "t": "For their tongue is polished by the workman, and they themselves are overlaid with gold and with silver; yet they are only fake, and can’t speak."
          },
          {
            "n": "9",
            "t": "And taking gold, as if it were for a virgin who loves to be happy, they make crowns for the heads of their gods."
          },
          {
            "n": "10",
            "t": "Sometimes also the priests take gold and silver from their gods, and spend it on themselves."
          },
          {
            "n": "11",
            "t": "They will even give some of it to the common prostitutes. They dress them like men with garments, even the gods of silver, gods of gold, and gods of wood."
          },
          {
            "n": "12",
            "t": "Yet these gods can’t save themselves from rust and moths, even though they are covered with purple garments."
          },
          {
            "n": "13",
            "t": "They wipe their faces because of the dust of the temple, which is thick upon them."
          },
          {
            "n": "14",
            "t": "And he who can’t put to death one who offends against him holds a sceptre, as though he were judge of a country."
          },
          {
            "n": "15",
            "t": "He has also a dagger in his right hand, and an axe, but can’t deliver himself from war and robbers."
          },
          {
            "n": "16",
            "t": "By this they are known not to be gods. Therefore don’t fear them."
          },
          {
            "n": "17",
            "t": "For like a vessel that a man uses is worth nothing when it is broken, even so it is with their gods. When they are set up in the temples, their eyes are full of dust through the feet of those who come in."
          },
          {
            "n": "18",
            "t": "As the courts are secured on every side upon him who offends the king, as being committed to suffer death, even so the priests secure their temples with doors, with locks, and bars, lest they be carried off by robbers."
          },
          {
            "n": "19",
            "t": "They light candles for them, yes, more than for themselves, even though they can’t see one."
          },
          {
            "n": "20",
            "t": "They are like one of the beams of the temple. Men say their hearts are eaten out when things creeping out of the earth devour both them and their clothing. They don’t feel it"
          },
          {
            "n": "21",
            "t": "when their faces are blackened through the smoke that comes out of the temple."
          },
          {
            "n": "22",
            "t": "Bats, swallows, and birds land on their bodies and heads. So do the cats."
          },
          {
            "n": "23",
            "t": "By this you may know that they are no gods. Therefore don’t fear them."
          },
          {
            "n": "24",
            "t": "Notwithstanding the gold with which they are covered to make them beautiful, unless someone wipes off the tarnish, they won’t shine; for they didn’t even feel it when they were molten."
          },
          {
            "n": "25",
            "t": "Things in which there is no breath are bought at any cost."
          },
          {
            "n": "26",
            "t": "Having no feet, they are carried upon shoulders. By this, they declare to men that they are worth nothing."
          },
          {
            "n": "27",
            "t": "Those who serve them are also ashamed, for if they fall to the ground at any time, they can’t rise up again by themselves. If they are bowed down, they can’t make themselves straight; but the offerings are set before them, as if they were dead men."
          },
          {
            "n": "28",
            "t": "And the things that are sacrificed to them, their priests sell and spend. In like manner, their wives also lay up part of it in salt; but to the poor and to the impotent they give none of it."
          },
          {
            "n": "29",
            "t": "The menstruous woman and the woman in childbed touch their sacrifices, knowing therefore by these things that they are no gods. Don’t fear them."
          },
          {
            "n": "30",
            "t": "For how can they be called gods? Because women set food before the gods of silver, gold, and wood."
          },
          {
            "n": "31",
            "t": "And in their temples the priests sit on seats, having their clothes torn and their heads and beards shaven, and nothing on their heads."
          },
          {
            "n": "32",
            "t": "They roar and cry before their gods, as men do at the feast when one is dead."
          },
          {
            "n": "33",
            "t": "The priests also take off garments from them and clothe their wives and children with them."
          },
          {
            "n": "34",
            "t": "Whether it is evil or good what one does to them, they are not able to repay it. They can’t set up a king or put him down."
          },
          {
            "n": "35",
            "t": "In like manner, they can neither give riches nor money. Though a man make a vow to them and doesn’t keep it, they will never exact it."
          },
          {
            "n": "36",
            "t": "They can save no man from death. They can’t deliver the weak from the mighty."
          },
          {
            "n": "37",
            "t": "They can’t restore a blind man to his sight, or deliver anyone who is in distress."
          },
          {
            "n": "38",
            "t": "They can show no mercy to the widow, or do good to the fatherless."
          },
          {
            "n": "39",
            "t": "They are like the stones that are cut out of the mountain, these gods of wood that are overlaid with gold and with silver. Those who minister to them will be confounded."
          },
          {
            "n": "40",
            "t": "How could a man then think or say that they are gods, when even the Chaldeans themselves dishonor them?",
            "p": true
          },
          {
            "n": "41",
            "t": "If they shall see one mute who can’t speak, they bring him and ask him to call upon Bel, as though he were able to understand."
          },
          {
            "n": "42",
            "t": "Yet they can’t perceive this themselves, and forsake them; for they have no understanding."
          },
          {
            "n": "43",
            "t": "The women also with cords around them sit in the ways, burning bran for incense; but if any of them, drawn by someone who passes by, lies with him, she reproaches her fellow, that she was not thought as worthy as herself and her cord wasn’t broken."
          },
          {
            "n": "44",
            "t": "Whatever is done among them is false. How could a man then think or say that they are gods?"
          },
          {
            "n": "45",
            "t": "They are fashioned by carpenters and goldsmiths. They can be nothing else than what the workmen make them to be."
          },
          {
            "n": "46",
            "t": "And they themselves who fashioned them can never continue long. How then should the things that are fashioned by them?"
          },
          {
            "n": "47",
            "t": "For they have left lies and reproaches to those who come after."
          },
          {
            "n": "48",
            "t": "For when there comes any war or plague upon them, the priests consult with themselves, where they may be hidden with them."
          },
          {
            "n": "49",
            "t": "How then can’t men understand that they are no gods, which can’t save themselves from war or from plague?"
          },
          {
            "n": "50",
            "t": "For seeing they are only wood and overlaid with gold and silver, it will be known hereafter that they are false."
          },
          {
            "n": "51",
            "t": "It will be manifest to all nations and kings that they are no gods, but the works of men’s hands, and that there is no work of God in them."
          },
          {
            "n": "52",
            "t": "Who then may not know that they are not gods?"
          },
          {
            "n": "53",
            "t": "For they can’t set up a king in a land or give rain to men.",
            "p": true
          },
          {
            "n": "54",
            "t": "They can’t judge their own cause, or redress a wrong, being unable; for they are like crows between heaven and earth."
          },
          {
            "n": "55",
            "t": "For even when fire falls upon the house of gods of wood overlaid with gold or with silver, their priests will flee away, and escape, but they themselves will be burned apart like beams."
          },
          {
            "n": "56",
            "t": "Moreover they can’t withstand any king or enemies. How could a man then admit or think that they are gods?"
          },
          {
            "n": "57",
            "t": "Those gods of wood overlaid with silver or with gold aren’t able to escape from thieves or robbers."
          },
          {
            "n": "58",
            "t": "The gold, silver, and garments with which they are clothed—those who are strong will take from them, and go away with them. They won’t be able to help themselves."
          },
          {
            "n": "59",
            "t": "Therefore it is better to be a king who shows his manhood, or else a vessel in a house profitable for whatever the owner needs, than such false gods—or even a door in a house, to keep the things safe that are in it, than such false gods; or better to be a pillar of wood in a palace than such false gods."
          },
          {
            "n": "60",
            "t": "For sun, moon, and stars, being bright and sent to do their jobs, are obedient.",
            "p": true
          },
          {
            "n": "61",
            "t": "Likewise also the lightning when it flashes is beautiful to see. In the same way, the wind also blows in every country."
          },
          {
            "n": "62",
            "t": "And when God commands the clouds to go over the whole world, they do as they are told."
          },
          {
            "n": "63",
            "t": "And the fire sent from above to consume mountains and woods does as it is commanded; but these are to be compared to them neither in show nor power."
          },
          {
            "n": "64",
            "t": "Therefore a man shouldn’t think or say that they are gods, seeing they aren’t able to judge causes or to do good to men."
          },
          {
            "n": "65",
            "t": "Knowing therefore that they are no gods, don’t fear them."
          },
          {
            "n": "66",
            "t": "For they can neither curse nor bless kings."
          },
          {
            "n": "67",
            "t": "They can’t show signs in the heavens among the nations, or shine as the sun, or give light as the moon."
          },
          {
            "n": "68",
            "t": "The beasts are better than they, for they can find shelter and help themselves."
          },
          {
            "n": "69",
            "t": "In no way then is it manifest to us that they are gods. Therefore don’t fear them."
          },
          {
            "n": "70",
            "t": "For as a scarecrow in a garden of cucumbers that keeps nothing, so are their gods of wood overlaid with gold and silver."
          },
          {
            "n": "71",
            "t": "Likewise also their gods of wood overlaid with gold and with silver are like a white thorn in an orchard that every bird sits upon. They are also like a dead body that is thrown out into the dark."
          },
          {
            "n": "72",
            "t": "You will know them to be no gods by the bright purple that rots upon them. They themselves will be consumed afterwards, and will be a reproach in the country."
          },
          {
            "n": "73",
            "t": "Better therefore is the just man who has no idols; for he will be far from reproach."
          }
        ]
      }
    ]
  },
  "SNG": {
    "code": "SNG",
    "name": "Song of Solomon",
    "chapters": [
      {
        "c": 1,
        "verses": [
          {
            "n": "1",
            "t": "The Song of songs, which is Solomon’s.",
            "p": true
          },
          {
            "n": "2",
            "t": "\tLet him kiss me with the kisses of his mouth;\n\t\tfor your love is better than wine.",
            "h": "Beloved"
          },
          {
            "n": "3",
            "t": "\tYour oils have a pleasing fragrance.\n\t\tYour name is oil poured out,\n\t\ttherefore the virgins love you."
          },
          {
            "n": "4",
            "t": "\tTake me away with you.\n\t\tLet’s hurry.\n\t\tThe king has brought me into his rooms.\n\tWe will be glad and rejoice in you.\n\t\tWe will praise your love more than wine!\n\tThey are right to love you."
          },
          {
            "n": "5",
            "t": "\tI am dark, but lovely,\n\t\tyou daughters of Jerusalem,\n\t\tlike Kedar’s tents,\n\t\tlike Solomon’s curtains.",
            "h": "Friends Beloved"
          },
          {
            "n": "6",
            "t": "\tDon’t stare at me because I am dark,\n\t\tbecause the sun has scorched me.\n\tMy mother’s sons were angry with me.\n\t\tThey made me keeper of the vineyards.\n\t\tI haven’t kept my own vineyard."
          },
          {
            "n": "7",
            "t": "\tTell me, you whom my soul loves,\n\t\twhere you graze your flock,\n\t\twhere you rest them at noon;\n\t\tfor why should I be as one who is veiled\n\t\tbeside the flocks of your companions?"
          },
          {
            "n": "8",
            "t": "\tIf you don’t know, most beautiful among women,\n\t\tfollow the tracks of the sheep.\n\t\tGraze your young goats beside the shepherds’ tents.",
            "h": "Lover"
          },
          {
            "n": "9",
            "t": "\tI have compared you, my love,\n\t\tto a steed in Pharaoh’s chariots.",
            "b": true
          },
          {
            "n": "10",
            "t": "\tYour cheeks are beautiful with earrings,\n\t\tyour neck with strings of jewels."
          },
          {
            "n": "11",
            "t": "\tWe will make you earrings of gold,\n\t\twith studs of silver.",
            "h": "Friends"
          },
          {
            "n": "12",
            "t": "\tWhile the king sat at his table,\n\t\tmy perfume spread its fragrance.",
            "h": "Beloved"
          },
          {
            "n": "13",
            "t": "\tMy beloved is to me a sachet of myrrh,\n\t\tthat lies between my breasts."
          },
          {
            "n": "14",
            "t": "\tMy beloved is to me a cluster of henna blossoms\n\t\tfrom the vineyards of En Gedi."
          },
          {
            "n": "15",
            "t": "\tBehold, you are beautiful, my love.\n\t\tBehold, you are beautiful.\n\t\tYour eyes are like doves.",
            "h": "Lover"
          },
          {
            "n": "16",
            "t": "\tBehold, you are beautiful, my beloved, yes, pleasant;\n\t\tand our couch is verdant.",
            "h": "Beloved"
          },
          {
            "n": "17",
            "t": "\tThe beams of our house are cedars.\n\t\tOur rafters are firs.",
            "h": "Lover"
          }
        ]
      }
    ]
  },
  "SIR": {
    "code": "SIR",
    "name": "Sirach",
    "chapters": [
      {
        "c": 11,
        "verses": [
          {
            "n": "1",
            "t": "\tThe wisdom of the lowly will lift up his head,\n\t\tand make him sit in the midst of great men."
          },
          {
            "n": "2",
            "t": "\tDon’t commend a man for his good looks.\n\t\tDon’t abhor a man for his outward appearance.",
            "b": true
          },
          {
            "n": "3",
            "t": "\tThe bee is little among flying creatures,\n\t\tbut what it produces is the best of confections."
          },
          {
            "n": "4",
            "t": "\tDon’t boast about the clothes you wear,\n\t\tand don’t exalt yourself in the day of honor;\n\tfor the Lord’s works are wonderful,\n\t\tand his works are hidden among men."
          },
          {
            "n": "5",
            "t": "\tMany kings have sat down upon the ground,\n\t\tbut one who was never thought of has worn a crown."
          },
          {
            "n": "6",
            "t": "\tMany mighty men have been greatly disgraced.\n\t\tMen of renown have been delivered into other men’s hands."
          },
          {
            "n": "7",
            "t": "\tDon’t blame before you investigate.\n\t\tUnderstand first, and then rebuke.",
            "b": true
          },
          {
            "n": "8",
            "t": "\tDon’t answer before you have heard.\n\t\tDon’t interrupt while someone else is speaking."
          },
          {
            "n": "9",
            "t": "\tDon’t argue about a matter that doesn’t concern you.\n\t\tDon’t sit with sinners when they judge."
          },
          {
            "n": "10",
            "t": "\tMy son, don’t be busy about many matters;\n\t\tfor if you meddle much, you will not be unpunished.\n\tIf you pursue, you will not overtake,\n\t\tand you will not escape by fleeing.",
            "b": true
          },
          {
            "n": "11",
            "t": "\tThere is one who toils, labors, and hurries,\n\t\tand is even more behind."
          },
          {
            "n": "12",
            "t": "\tThere is one who is sluggish, and needs help,\n\t\tlacking in strength, and who abounds in poverty,\n\tbut the Lord’s eyes looked upon him for good,\n\t\tand he raised him up from his low condition,"
          },
          {
            "n": "13",
            "t": "\tand lifted up his head\n\t\tso that many marveled at him."
          },
          {
            "n": "14",
            "t": "\tGood things and bad, life and death,\n\t\tpoverty and riches, are from the Lord.",
            "b": true
          },
          {
            "n": "15-16",
            "t": ""
          },
          {
            "n": "17",
            "t": "\tThe Lord’s gift remains with the godly.\n\t\tHis good pleasure will prosper forever."
          },
          {
            "n": "18",
            "t": "\tOne grows rich by his diligence and self-denial,\n\t\tand this is the portion of his reward:"
          },
          {
            "n": "19",
            "t": "\twhen he says, “I have found rest,\n\t\tand now I will eat of my goods!”\n\the doesn’t know how much time will pass\n\t\tuntil he leaves them to others and dies."
          },
          {
            "n": "20",
            "t": "\tBe steadfast in your covenant and be doing it,\n\t\tand grow old in your work."
          },
          {
            "n": "21",
            "t": "\tDon’t marvel at the works of a sinner,\n\t\tbut trust the Lord and stay in your labor;\n\tfor it is an easy thing in the sight of the Lord\n\t\tto swiftly and suddenly make a poor man rich.",
            "b": true
          },
          {
            "n": "22",
            "t": "\tThe Lord’s blessing is in the reward of the godly.\n\t\tHe makes his blessing flourish in an hour that comes swiftly."
          },
          {
            "n": "23",
            "t": "\tDon’t say, “What use is there of me?\n\t\tWhat further good things can be mine?”"
          },
          {
            "n": "24",
            "t": "\tDon’t say, “I have enough.\n\t\tWhat harm could happen to me now?”"
          },
          {
            "n": "25",
            "t": "\tIn the day of good things, bad things are forgotten.\n\t\tIn the day of bad things, a man will not remember things that are good."
          },
          {
            "n": "26",
            "t": "\tFor it is an easy thing in the sight of the Lord\n\t\tto reward a man in the day of death according to his ways."
          },
          {
            "n": "27",
            "t": "\tThe affliction of an hour causes delights to be forgotten.\n\t\tIn the end, a man’s deeds are revealed."
          },
          {
            "n": "28",
            "t": "\tCall no man happy before his death.\n\t\tA man will be known in his children."
          },
          {
            "n": "29",
            "t": "\tDon’t bring every man into your house,\n\t\tfor many are the tricks of a deceitful man.",
            "b": true
          },
          {
            "n": "30",
            "t": "\tLike a decoy partridge in a cage, so is the heart of a proud man.\n\t\tLike a spy, he looks for your weakness."
          },
          {
            "n": "31",
            "t": "\tFor he lies in wait to turn things that are good into evil,\n\t\tand assigns blame in things that are praiseworthy."
          },
          {
            "n": "32",
            "t": "\tFrom a spark of fire, a heap of many coals is kindled,\n\t\tand a sinful man lies in wait to shed blood."
          },
          {
            "n": "33",
            "t": "\tTake heed of an evil-doer, for he plans wicked things,\n\t\tlest perhaps he ruin your reputation forever."
          },
          {
            "n": "34",
            "t": "\tReceive a stranger into your house, and he will distract you with arguments\n\t\tand estrange you from your own family."
          }
        ]
      }
    ]
  }
};

/** The verses of every book of the source, by code (what the index of the real data holds). */
export const FIXTURE_VERSE_COUNTS: Record<string, number> = {"GEN": 1533, "EXO": 1213, "LEV": 859, "NUM": 1288, "DEU": 959, "JOS": 658, "JDG": 618, "RUT": 85, "1SA": 810, "2SA": 695, "1KI": 816, "2KI": 719, "1CH": 942, "2CH": 822, "EZR": 280, "NEH": 406, "JOB": 1070, "PSA": 2461, "PRO": 915, "ECC": 222, "SNG": 117, "ISA": 1292, "JER": 1364, "LAM": 154, "EZK": 1273, "HOS": 197, "JOL": 73, "AMO": 146, "OBA": 21, "JON": 48, "MIC": 105, "NAM": 47, "HAB": 56, "ZEP": 53, "HAG": 38, "ZEC": 211, "MAL": 55, "TOB": 244, "JDT": 339, "ESG": 205, "WIS": 436, "SIR": 1383, "BAR": 213, "1MA": 924, "2MA": 555, "DAG": 530, "MAT": 1071, "MRK": 678, "LUK": 1151, "JHN": 879, "ACT": 1007, "ROM": 434, "1CO": 437, "2CO": 257, "GAL": 149, "EPH": 155, "PHP": 104, "COL": 95, "1TH": 89, "2TH": 47, "1TI": 113, "2TI": 83, "TIT": 46, "PHM": 25, "HEB": 303, "JAS": 108, "1PE": 105, "2PE": 61, "1JN": 105, "2JN": 13, "3JN": 14, "JUD": 25, "REV": 404};
