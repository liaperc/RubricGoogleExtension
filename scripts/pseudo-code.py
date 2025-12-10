str_a = "Mathematical Practice Standard 1A: Mathematical Communication - Student work is organized and includes key computational details."
str_b = "potattatootoespoptoetatesopoptosptoesMathematical Practice Standard 1A: Mathematical Communication - Student work is organized and includes key computational."
score = 10

# if they're the same
if str_a == str_b:
    score = 100
    print(score/10)
else:
    # number of words in common

    counts = [True if word in str_a else False for word in str_b.split(" ")]
    val_1 = sum(counts)/len(str_b.split(" "))

    score = score * (1+val_1/10)


    # if b is inside a

    if str_b in str_a:
        score = score * 1.25


    # number of sequential characters in common ??? (uncertain how to do this)

    # dot product of strings! since why not (read: the worst code ever)

    a = list(map(ord, list(str_a)))
    b = list(map(ord, list(str_b)))

    avg = (sum(a)+sum(b))/(len(a)+len(b))

    score += (sum([x*y for x,y in zip(a,b)])/avg)/(len(a)+len(b))


    print(score/10)

