Mod Tools Enhanced 
========

Based on [DEADB33F's original modtools](http://userscripts.org/scripts/show/116254). Fully backwards compatible with the DEADB33F's modtools.


Includes: 

- Ban button next to user names. 
- GUI improvements to the removal reasons popup.
- No popup when removing comments. 
- Support for logging removals and bans to a log subreddit. (includes the adition of `<logsub>`, `<logtitle>`, `<bantitle>`, `<logreason>` to css configuration)
- Ability to define generic footers and headers. (`<header>` & `<footer>`)
- Select multiple reasons at once.
- Support for RES' Never Ending Reddit.
- Support for banning reasons.

New tokens:

- {domain} the domain of the removed submission.
- {link} the link of the removed submission (same as {url} for self-posts)
- {reason} this is the reason something was removed or someone was banned.  It should not be used/will not work without <logsub>.
- {loglink} the link to the removal log thread.  It should not be used/will not work without <logsub>.



This version is fully compatible with the css reasons of DEADB33F's original modtools. Reasons for this version should be put in `<removereasons2>` brackets. Example as it is used in /r/theoryofreddit: 


    <removereasons2>

    <header>Thank you for your {kind}! Unfortunately, your {kind} has been removed for the following reason(s):</header>
     
    <footer>If you would like to appeal this decision or continue the discussion, [please feel free to do so here]({loglink}).</footer>

    <logsub>TheoryOfModeration</logsub>
    <logtitle>[{author}] {title} [{reason}]</logtitle>
    <bantitle>[{author}] {title} [{reason}]</bantitle>
    <logreason>inappropriate</logreason>

    <reason>* It is not suited for /r/{subreddit}. A more suitable subreddit for this submission would be 
         <select id="selectbox">
            <option>/r/Help</option>
            <option>/r/Circlebroke</option>
            <option>/r/Circlebroke2</option>
            <option>/r/SubredditDrama</option>
            <option>/r/AboutReddit</option>
            <option>/r/self</option>
            <option>/r/RedditDev</option>
        </select>.     
    </reason>

    <reason>* Submissions to /r/{subreddit} should focus on data, issues, solutions, or strategies that could be reasonably addressed or implemented by **users and moderators**, *not admins*.
        <br>
        This submission is better suited for /r/IdeasForTheAdmins.
    </reason>

    <reason>* It is not about reddit or the reddit community.</reason>

    <reason>* Submissions with a question should at least contain a motivation for asking the question in the text field. Posts with nothing but a title will be removed.         
    </reason>

    <reason><textarea id="customReason" placeholder="Enter Custom reason" /></reason>

    </removereasons2>

### [Reddit Thread](http://www.reddit.com/r/toolbox/comments/1etr6b/mod_tools_enhanced/)

---

####Screenshots

[New removal reasons windows](http://i.imgur.com/2Am4NQv.png), [Ban Button](http://i.imgur.com/5nbWDfH.png)


---

##[Install](http://userscripts.org/scripts/show/165486)

Please install from userscripts.org.  The version hosted here is the devlopment branch, and likely unstable.
