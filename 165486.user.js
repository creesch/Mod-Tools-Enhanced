// ==UserScript==
// @name        Mod Tools Enhanced
// @namespace   http://userscripts.org/scripts/show/165486
// @version     6.3
// @include     http://www.reddit.com/*
// @include     http://reddit.com/*
// @include     http://*.reddit.com/*
// @downloadURL http://userscripts.org/scripts/source/165486.user.js
// @run-at document-start
// ==/UserScript==

function modtools() {
    var currenturl = document.URL;
    var notEnabled = [''];

    function removequotes(string) {
        return string.replace(/['"]/g, '');
    }

    function getRemovalReasons(data, callback) {

        // Try getting data from the wiki first. 404s are **much** quicker than downloading the entire stylesheet first.
        getData('http://www.reddit.com/r/' + data.subreddit + '/wiki/toolbox.json');

        // Get the removal reasons in this order: wikiJSON, <removalreasons2>, <removalreasons>.
        function getData(URL) {
            console.log('trying: ' + URL);

            // Try the URL provided, fall back as needed.
            $.get(URL, function (response) {

                    // This *seems* out of order, but if we got a 404 for the wiki this is the *second* call to this method,
                    // but the URL was the stylesheet. So we need this check to see if there is valid wiki data.
                    // If not, we need to try and parse the removal reasons from the CSS.
                    if (!response.data.content_md) {
                        parseOldReasons(response);
                        return;
                    }

                    // See if we have the new wikiJSON format first.
                    var rr = JSON.parse(response.data.content_md).removalReasons || '';

                    // Try to fall back to old <removalreasons>, again.  If this check fires, there is a valid toolbox page in the wiki,
                    // but for whatever reason, it doesn't have removla reasons?  (Or, this should *never* happen)
                    if (!rr) {
                        getData('http://www.reddit.com/r/' + data.subreddit + '/about/stylesheet.json');
                        return;
                    }

                    // Get reason data from another sub.
                    if (rr.getfrom) {
                        getData('http://www.reddit.com/r/' + rr.getfrom + '/wiki/toolbox.json');
                        return;
                    }

                    //// OK, if we're this far, we're rocking valid data, from *this* sub, from the wiki. ////

                    // Get PM subject line
                    data.subject = rr.pmsubject || 'Your {kind} was removed from {subreddit}';

                    // Add additinal data that is found in the wikiJSON.  
                    // Any HTML needs to me unescaped, because we store it escaped in the wiki.
                    data.logreason = rr.logreason || '';
                    data.header = unescape(rr.header || '');
                    data.footer = unescape(rr.footer || '');
                    data.logsub = rr.logsub || '';
                    data.logtitle = rr.logtitle || 'Removed: {kind} by /u/{author} to /r/{subreddit}';
                    data.bantitle = rr.bantitle || '/u/{author} has been {title} from /r/{subreddit} for {reason}';
                    data.reasons = [];

                    // Loop through the reasons... unescaping each.
                    $(rr.reasons).each(function () {
                            data.reasons.push(unescape(this.text));
                    });

                    // Show the removal reason dialog.
                    callback(data);

                }).error(function (err) {
                    // Lots of stuff going on here.
                    // If we hit a 404 on the first goround, that means the wiki page for toolbox 404'd.
                    // BUT, we could have also gotten a 404 for another reason.  So, we need to check if it's
                    // the exact 404 the wiki gives.  That 404 is JSON that has a 'reason' prop.
                    // If it's that one, we need to fall back to the wiki and try again for the old formt.
                    // Otherwise, it's just a normal 404 and we need to just push this sub to 'notEnabled'

                    // The wikiJSON doesn't exist, try the CSS.
                    if (JSON.parse(err.responseText).reason) {

                        // DAE recursion?
                        getData('http://www.reddit.com/r/' + data.subreddit + '/about/stylesheet.json');
                        return;
                    }

                    // It's not a wiki error, so it's simply not supported or another type of 404.
                    notEnabled.push(data.subreddit);
                    callback();
                    return;
                });
        }

        function parseOldReasons(response) {
            // All of this function is the same as the old system.  Nothing new here.
            if (!response.data) {
                notEnabled.push(data.subreddit);
                callback();
                return;
            }

            // See if this subreddit is configured for leaving reasons using <removalreasons2>
            var match = response.data.stylesheet.replace(/\n+|\s+/g, ' ')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .match(/<removereasons2>.+<\/removereasons2>/i)

            // Try falling back to <removalreasons>
            if (!match) {
                match = response.data.stylesheet.replace(/\n+|\s+/g, ' ')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .match(/<removereasons>.+<\/removereasons>/i);
            }

            // Neither removal reason tag can be found, and if we got this far, we've already failed the wikiJSON tries.
            // There is no way this sub supports any form of removal reasons.
            if (!match) {
                notEnabled.push(data.subreddit);
                callback();
                return;
            }

            //// We're good, we found old removal reasons. ////

            // Create valid XML from parsed string
            var XML = $(match[0].replace(/\{subreddit\}/gi, data.subreddit));

            // Get PM subject line
            data.subject = (XML.find('pmsubject').text() || 'Your {kind} was removed from {subreddit}');

            // Add additinal data that is found in the CSS.
            data.logreason = XML.find('logreason').text() || '';
            data.header = XML.find('header').text() || '';
            data.footer = XML.find('footer').text() || '';
            data.logsub = XML.find('logsub').text() || '';
            data.logtitle = XML.find('logtitle').text() || 'Removed: {kind} by /u/{author}  to /r/{subreddit}';
            data.bantitle = XML.find('bantitle').text() || '/u/{author} has been {title} from /r/{subreddit} for {reason}';
            data.reasons = [];

            XML.find('reason').each(function () {
                data.reasons.push(this.innerHTML);
            });

            // SUCCESS!  Show the pop-up!
            callback(data);
            return;
        }
    }

    // Open reason dropdown when we remove something as ham.
    $('.big-mod-buttons>span>.pretty-button.neutral, .remove-button').live('click', openRemovalPopup);

    function openRemovalPopup(event) {
        var thingclasses = $(this).parents('div.thing').attr('class');
        if (thingclasses.match(/\bcomment\b/)) return;

        // Close popup if we click outside of it, disabled for now since it is causing a annoyance
        //    $(document).mouseup(function (e) {
        //        var container = $(".reason-popup-content");
        //        if (container.has(e.target).length === 0) {
        //             $(".reason-popup").hide();
        //        }
        //     });

        // Get link/comment attributes
        var button = $(this),
            thing = button.thing(),
            data = {
                subreddit: thing.find('a.subreddit').text() || reddit.post_site || thing.find('.buttons .first a').attr('href').match(/\/r\/(\w+)\//)[1],
                fullname: thing.thing_id(),
                author: thing.find('a.author:first').text(),
                title: thing.find('a.title').length ? '"' + thing.find('a.title').text() + '"' : '',
                kind: thing.hasClass('link') ? 'submission' : 'comment',
                mod: reddit.logged,
                url: thing.find('.buttons:first .first a').attr('href'),
                link: thing.find('a.title').attr('href'),
                domain: thing.find('span.domain:first').text().replace('(', '').replace(')', '')
            };

        if (!data.subreddit || notEnabled.indexOf(data.subreddit) != -1) return;

        // Set attributes and open reason box if one already exists for this subreddit
        var popup = $('#reason-popup-' + data.subreddit);
        if (popup.length) {
            popup.css({
                    display: ''
                })
                .find('attrs').attr(data).end()
                .find('th input[type=checkbox]:checked').attr('checked', false)
                .end().find('.status').hide();
            button.find('.yes').click();
            return false;
        }

        // Get removal reasosn.
        getRemovalReasons(data, function (resp) {
                data = resp;
                if (data && data.reasons.length > 0) {
                    showPopUp();
                }
            });

        function showPopUp() {

            // Click yes on the removal.
            button.find('.yes').click();

            // Only show removal reason leaver if we have a logsub.
            var logDisplay = data.logsub ? '' : 'none',
                headerDisplay = data.header ? '' : 'none',
                footerDisplay = data.footer ? '' : 'none';

            // Make box & add reason radio buttons
            var popup = $('\
                <div class="reason-popup" id="reason-popup-' + data.subreddit + '" >\
                    <attrs />\
                    <div class="reason-popup-content"> \
                    <h2>Reason for /r/' + data.subreddit + '/ :</h2><span> \
        			<p>Removing: <a href="' + data.url + '" target="_blank">' + data.title + '</a></p>\
					<div style="display:' + headerDisplay + '"><p><input type="checkbox" id="include-header" checked> Include header. </input><br>\
                    <label id="reason-header">' + data.header + '</label></p></div> \
                    <table><tbody /></table>\
					<div style="display:' + footerDisplay + '"><p><input type="checkbox" id="include-footer" checked> Include footer. </input><br>\
                    <label id="reason-footer" name="footer">' + data.footer + '</label></p></div> \
					<p><label style="display:' + logDisplay + '">  Log Reason(s): </label> \
                    <input id="logreason" style="display:' + logDisplay + '" type="text" name="logreason" value="' + data.logreason + '"> \
					<label style="display:' + logDisplay + '"> <br>(Used for posting a log to /r/' + data.logsub + '. Will only be used when "send" is clicked.) </label></p> \
					<div class="buttons">\
                        <label for="type-PM-' + data.subreddit + '"><input class="reason-type" type="radio" id="type-PM-' + data.subreddit + '" value="PM"    name="type-' + data.subreddit + '"' + (localStorage.getItem('reason-type') == 'PM' ? ' checked="1"' : '') + '>PM</label> / \
                        <label for="type-reply-' + data.subreddit + '"><input class="reason-type" type="radio" id="type-reply-' + data.subreddit + '" value="reply" name="type-' + data.subreddit + '"' + (localStorage.getItem('reason-type') == 'reply' ? ' checked="1"' : '') + '>reply</label> / \
                        <label for="type-both-' + data.subreddit + '"><input class="reason-type" type="radio" id="type-both-' + data.subreddit + '" value="both"  name="type-' + data.subreddit + '"' + (localStorage.getItem('reason-type') == 'both' ? ' checked="1"' : '') + '>both</label>\
                        <span class="right">\
						<input type="hidden" name="tom_or_not" value="no-tom"> \
                            <span class="status error">saving....</span>\
                            <button class="save">send</button>\
                            <button class="cancel">no reason</button>\
                        </span>\
						<div>\
                    <div>\
                <div>')
                .appendTo('body')
                .css({
                    display: 'block'
                })
                .find('attrs').attr(data).end(),
                i = 0;

            $(data.reasons).each(function () {
                    popup.find('tbody').append('<tr><th><input type="checkbox" name="reason-' + data.subreddit + '" id="reason-' + data.subreddit + '-' + i + '"></th><td><label for="reason-' + data.subreddit + '-' + (i++) + '">' + this + '<BR></label></td></tr>');
                });

            // Pre fill reason input elements which have IDs.
            popup.find('td input[id],td textarea[id]').each(function () {
                    this.value = localStorage.getItem(this.id = 'reason-input-' + data.subreddit + '-' + this.id) || this.value;
                });

            // Disabled as it can cause you to select the wrong removal reason, now that you can choose more than one.
            //popup.find('td select[id]').each(function () {
            //    this.selectedIndex = localStorage.getItem(this.id = 'reason-input-' + data.subreddit + '-' + this.id) || this.selectedIndex;
            //});
        }

        return false;
    }

    $('body').delegate('.reason-popup', 'click', function (e) {
            e.stopPropagation();
        });

    // Toggle PM/reply/both notification method
    $('body').delegate('.reason-type', 'click', function () {
            localStorage.setItem('reason-type', this.value);
        });

    // 'cancel' button clicked
    $('body').delegate('.reason-popup .cancel', 'click', function () {
            $(this).parents('.reason-popup').hide();
        });

    // 'save' button clicked
    $('body').delegate('.reason-popup .save', 'click', function () {

            var button = $(this),
                popup = button.parents('.reason-popup'),
                notifyBy = popup.find('.reason-type:checked').val(),
                checked = popup.find('th input[type=checkbox]:checked'),
                status = popup.find('.status').show(),
                attrs = popup.find('attrs'),
                subject = attrs.attr('subject'),
                logtitle = attrs.attr('logtitle'),
                header = $('#reason-header').text(),
                footer = $('#reason-footer').text(),
                logreason = $("#logreason").val(),
                reason = '',
                data = {
                    subreddit: '',
                    fullname: '',
                    author: '',
                    title: '',
                    kind: '',
                    mod: '',
                    url: '',
                    link: '',
                    domain: '',
                    logsub: ''
                };

            // Check if reason checked
            if (!checked.length) return status.text('error, no reason selected');

            // Get reason text
            checked.parent().next().children().contents().each(function () {
                    reason += this.tagName == 'BR' ? '\n\n' : this.value || this.textContent;
                });

            // Add header and footer to reason, if they are selected.
            if ($('#include-header').is(':checked')) {
                reason = header + '\n\n' + reason;
            }

            if ($('#include-footer').is(':checked')) {
                reason = reason + '\n\n' + footer;
            }

            for (i in data) {
                var pattern = new RegExp('{' + i + '}', 'mig');
                data[i] = attrs.attr(i);
                reason = reason.replace(pattern, data[i]);
                subject = subject.replace(pattern, data[i]);
                logtitle = logtitle.replace(pattern, data[i]);
            }

            // check if we need to make a puplic log post and if we have all the data
            if (data.logsub) {
                if (!logreason) return status.text('error, public log reason missing');

                // Set log reason to entered reason.
                logtitle = logtitle.replace('{reason}', logreason);
            }

            function removalmessage_pm(is_tom) {
                if (is_tom == 'no_tom') {} else {
                    reason = reason.replace('{loglink}', is_tom);
                }
                // Reply to submission/comment...
                if (notifyBy == 'reply' || notifyBy == 'both') $.post('/api/comment', {
                            parent: data.fullname,
                            uh: reddit.modhash,
                            text: reason,
                            api_type: 'json'
                        })
                        .success(function (d) {
                            $.post('/api/distinguish/yes', {
                                    id: d.json.data.things[0].data.id,
                                    uh: reddit.modhash
                                })
                                .success(function (d) {
                                    popup.hide();
                                })
                                .error(function () {
                                    status.text('error distinguishing reply');
                                });
                        })
                        .error(function () {
                            status.text('error posting reply');
                        });

                // ...and/or PM the user
                if (notifyBy == 'PM' || notifyBy == 'both') $.post('/api/compose', {
                            to: data.author,
                            uh: reddit.modhash,
                            subject: subject,
                            text: reason + '\n\n---\n[[Link to your ' + data.kind + '](' + data.url + ')]'
                        })
                        .success(function () {
                            popup.hide();
                        })
                        .error(function () {
                            status.text('error sending PM');
                        });
            }

            // If logsub is not empty we should log the removal.
            if (data.logsub) {
                $.post('/api/submit', {
                        kind: 'link',
                        resubmit: 'true',
                        url: data.url,
                        uh: reddit.modhash,
                        title: removequotes(logtitle),
                        sr: data.logsub,
                        api_type: 'json'
                    })
                    .done(function (data) {
                        removalmessage_pm(data.json.data.url);
                        var removalid = data.json.data.url;
                        removalid = removalid.match(/http:\/\/www.reddit.com\/r\/.+?\/comments\/([^\/]+?)\/.*/);
                        removalid = 't3_' + removalid[1];

                        $.post('/api/approve', {
                                id: removalid,
                                uh: reddit.modhash
                            });
                        return;
                    });

            } else {
                removalmessage_pm('no_tom');
            }
        });

    // Reason textarea/input/select changed
    $('body').delegate('.reason-popup td input[id],.reason-popup td textarea[id],.reason-popup td select[id]', 'change', function () {
            localStorage.setItem(this.id, this.selectedIndex || this.value);
        });

    // Add modtools buttons to page.

    function addModtools() {
        var numberRX = /-?\d+/,
            reportsThreshold = (localStorage.getItem('reports-threshold') || 1),
            listingOrder = (localStorage.getItem('reports-order') || 'age'),
            sortAscending = (localStorage.getItem('reports-ascending') == 'true'),
            viewingspam = !! location.pathname.match(/\/about\/(spam|trials)/),
            viewingreports = !! location.pathname.match(/\/about\/reports/),
            allSelected = false;
        if (viewingspam && listingOrder == 'reports') listingOrder = 'age';

        // Get rid of promoted links & thing rankings
        $('#siteTable_promoted,#siteTable_organic,.rank').remove();

        //remove stuff we cant moderate.
        $('.thing .report-button').parents('.thing').remove();
        $('.modtools-on').parent().remove();

        // Make visible any collapsed things (stuff below /prefs/ threshold)
        $('.entry .collapsed:visible a.expand:contains("[+]")').click();

        // Add checkboxes, tabs, menu, etc
        $('#siteTable').before('\
            <div class="menuarea modtools" style="padding: 5px 0;margin: 5px 0;"> \
                <input style="margin:5px;float:left" title="Select all/none" type="checkbox" id="select-all" title="select all/none"/> \
                <span>\
                    <a href="javascript:;" class="pretty-button invert inoffensive" accesskey="I" title="invert selection">&lt;/&gt;</a> \
                    <a href="javascript:;" class="pretty-button open-expandos inoffensive" title="toggle all expando boxes">[+]</a> \
                    <div onmouseover="hover_open_menu(this)" onclick="open_menu(this)" class="dropdown lightdrop "> \
                        <a href="javascript:;" class="pretty-button inoffensive select"> [select...]</a> \
                    </div>\
                    <div class="drop-choices lightdrop select-options"> \
                        ' + (viewingreports ? '' : '<a class="choice inoffensive" href="javascript:;" type="banned">shadow-banned</a>\
                        <a class="choice inoffensive" href="javascript:;" type="filtered">spam-filtered</a>\
                        ' + (viewingspam ? '' : '<a class="choice inoffensive" href="javascript:;" type="reported">has-reports</a>')) + '\
                        <a class="choice dashed" href="javascript:;" type="spammed">[ spammed ]</a> \
                        <a class="choice" href="javascript:;" type="removed">[ removed ]</a> \
                        <a class="choice" href="javascript:;" type="approved">[ approved ]</a>\
                        ' + (reddit.post_site && false ? '<a class="choice" href="javascript:;" type="flaired">[ flaired ]</a>' : '') + '\
                        <a class="choice" href="javascript:;" type="actioned">[ actioned ]</a>\
                        <a class="choice dashed" href="javascript:;" type="domain">domain...</a> \
                        <a class="choice" href="javascript:;" type="user">user...</a> \
                        <a class="choice" href="javascript:;" type="title">title...</a> \
                        <a class="choice dashed" href="javascript:;" type="comments">all comments</a> \
                        <a class="choice" href="javascript:;" type="links">all submissions</a> \
                        <a class="choice dashed" href="javascript:;" type="self">self posts</a> \
                        <a class="choice" href="javascript:;" type="flair">posts with flair</a> \
                    </div>\
                    &nbsp; \
                    <a href="javascript:;" class="pretty-button inoffensive unhide-selected" accesskey="U">unhide&nbsp;all</a> \
                    <a href="javascript:;" class="pretty-button inoffensive hide-selected"   accesskey="H">hide&nbsp;selected</a> \
                    <a href="javascript:;" class="pretty-button action negative" accesskey="S" type="negative" tabindex="3">spam&nbsp;selected</a> \
                    <a href="javascript:;" class="pretty-button action neutral"  accesskey="R" type="neutral"  tabindex="4">remove&nbsp;selected</a> \
                    <a href="javascript:;" class="pretty-button action positive" accesskey="A" type="positive" tabindex="5">approve&nbsp;selected</a> \
                    ' + (reddit.post_site && false ? '<a href="javascript:;" class="pretty-button flair-selected inoffensive" accesskey="F" tabindex="6">flair&nbsp;selected</a>' : '') + ' \
                </span> \
                <span class="dropdown-title lightdrop" style="float:right"> sort: \
                    <div onmouseover="hover_open_menu(this)" onclick="open_menu(this)" class="dropdown lightdrop "> \
                        <span class="selected sortorder">' + listingOrder + '</span> \
                    </div> \
                    <div class="drop-choices lightdrop sortorder-options"> \
                            <a class="choice" href="javascript:;">age</a> \
                            ' + (viewingspam ? '' : '<a class="choice" href="javascript:;">reports</a>') + ' \
                            <a class="choice" href="javascript:;">score</a> \
                    </div> \
                </span> \
            </div>');

        $('#header-bottom-left').append('<ul class="tabmenu ">' + (viewingspam ? '' : '<li><a><label for="modtab-threshold">threshold: </label><input id="modtab-threshold" value="' + reportsThreshold + '" style="width:10px;height:14px;border:none;background-color:#EFF7FF"/></a></li>') + '</ul>');
        $('.thing.link, .thing.comment').prepend('<input type="checkbox" tabindex="1" style="margin:5px;float:left;" />');
        $('.buttons .pretty-button').attr('tabindex', '2');

        //add class to processed threads.
        $('.thing').addClass('mte-processed');

        // Add context & history stuff
        $('body').append('<div class="pretty-button inline-content" style="z-index:9999;display:none;position:absolute;line-height:12px;min-width:100px"/>');
        $('#siteTable .comment .flat-list.buttons:has( a:contains("parent"))').each(function () {
                $(this).prepend('<li><a class="context" href="' + $(this).find('.first .bylink').attr('href') + '?context=2">context</a></li>');
            });

        //// Button actions ////

        // Select thing when clicked
        var noAction = ['A', 'INPUT', 'TEXTAREA', 'BUTTON'];
        $('.thing .entry').live('click', function (e) {
                if (noAction.indexOf(e.target.nodeName) + 1) return;
                $(this).thing().find('input[type=checkbox]:first').click();
            });

        // Change sort order
        $('.sortorder-options a').click(function () {
                var order = $(this).text(),
                    toggleAsc = (order == $('.sortorder').text());

                if (toggleAsc) sortAscending = !sortAscending;

                localStorage.setItem('reports-ascending', sortAscending);
                localStorage.setItem('reports-order', order);

                $('.sortorder').text(order);
                sortThings(order, sortAscending);
            });

        // Invert all the things.
        $('.invert').click(function () {
                $('.thing:visible input[type=checkbox]').click();
            });

        // Select / unselect all the things
        $('#select-all').click(function () {
                $('.thing:visible input[type=checkbox]').attr('checked', allSelected = this.checked);
            });
        $('.thing input[type=checkbox]').live('click', function () {
                $('#select-all').attr('checked', allSelected = !$('.thing:visible input[type=checkbox]').not(':checked').length);
            });

        // Select/unselect certain things
        $('.select-options a').click(function () {
                var things = $('.thing:visible'),
                    selector;

                switch (this.type) {
                case 'banned':
                    selector = '.banned-user';
                    break;
                case 'filtered':
                    selector = '.spam:not(.banned-user)';
                    break;
                case 'reported':
                    selector = ':has(.reported-stamp)';
                    break;
                case 'spammed':
                    selector = '.spammed,:has(.pretty-button.negative.pressed),:has(.remove-button:contains(spammed))';
                    break;
                case 'removed':
                    selector = '.removed,:has(.pretty-button.neutral.pressed),:has(.remove-button:contains(removed))';
                    break;
                case 'approved':
                    selector = '.approved,:has(.approval-checkmark,.pretty-button.positive.pressed),:has(.approve-button:contains(approved))';
                    break;
                case 'flaired':
                    selector = '.flaired';
                    break;
                case 'actioned':
                    selector = '.flaired,.approved,.removed,.spammed,:has(.approval-checkmark,.pretty-button.pressed),\
                                    :has(.remove-button:contains(spammed)),:has(.remove-button:contains(removed)),:has(.approve-button:contains(approved))';
                    break;
                case 'domain':
                    selector = ':has(.domain:contains(' + prompt('domain contains:', '').toLowerCase() + '))';
                    break;
                case 'user':
                    selector = ':has(.author:contains(' + prompt('username contains:\n(case sensitive)', '') + '))';
                    break;
                case 'title':
                    selector = ':has(a.title:contains(' + prompt('title contains:\n(case sensitive)', '') + '))';
                    break;
                case 'comments':
                    selector = '.comment';
                    break;
                case 'links':
                    selector = '.link';
                    break;
                case 'self':
                    selector = '.self';
                    break;
                case 'flair':
                    selector = ':has(.linkflair)';
                    break;
                }
                things.filter(selector).find('input[type=checkbox]').attr('checked', true);
            });
        $('.hide-selected').click(function () {
                $('.thing:visible:has(input:checked)').hide();
                $('.thing input[type=checkbox]').attr('checked', false);
            });
        $('.unhide-selected').click(function () {
                $('.thing').show();
            });

        // Mass spam/remove/approve
        $('.pretty-button.action').click(function () {
                var spam = (this.type == 'negative'),
                    type = (this.type == 'positive' ? 'approve' : 'remove');

                // Apply action
                $('.thing:visible>input:checked').parent()
                    .each(function () {
                        $.post('/api/' + type, {
                                uh: reddit.modhash,
                                spam: spam,
                                id: $(this).thing_id()
                            });
                    })
                    .css('opacity', '1')
                    .removeClass('flaired spammed removed approved')
                    .addClass((spam ? 'spamme' : type) + 'd');
            });

        // menuarea pretty-button feedback.
        $('.menuarea.modtools .pretty-button').click(function () {
                $(this).clearQueue().addClass('pressed').delay(200).queue(function () {
                        $(this).removeClass('pressed');
                    });
            });

        // Uncheck anything we've taken an action, if it's checked.
        $('.pretty-button').live('click', function () {
                $(this).closest('.thing').find('input[type=checkbox]').attr('checked', false);
            });

        // Set reports threshold (hide reports with less than X reports)
        $('#modtab-threshold').keypress(function (e) {
                e.preventDefault();

                var threshold = +String.fromCharCode(e.which);
                if (isNaN(threshold)) return;

                $(this).val(threshold);
                localStorage.setItem('reports-threshold', threshold);
                setThreshold($('.thing'));
            });

        function setThreshold(things) {
            var threshold = localStorage.getItem('reports-threshold');
            things.show().find('.reported-stamp').text(function (_, str) {
                    if (str.match(/\d+/) < threshold) $(this).thing().hide();
                });
        }
        setThreshold($('.thing'));

        // Function to sort items

        function sortThings(order, asc) {
            var things = $('#siteTable .thing').sort(function (a, b) {
                    (asc) ? (A = a, B = b) : (A = b, B = a);

                    switch (order) {
                    case 'age':
                        var timeA = new Date($(A).find('time:first').attr('datetime')).getTime(),
                            timeB = new Date($(B).find('time:first').attr('datetime')).getTime();
                        return timeA - timeB;
                    case 'score':
                        var scoreA = $(A).find('.score:visible').text().match(numberRX),
                            scoreB = $(B).find('.score:visible').text().match(numberRX);
                        return scoreA - scoreB;
                    case 'reports':
                        var reportsA = $(A).find('.reported-stamp').text().match(numberRX),
                            reportsB = $(B).find('.reported-stamp').text().match(numberRX);
                        return reportsA - reportsB;
                    }
                });
            $('#siteTable').empty().append(things);
        }
        sortThings(listingOrder, sortAscending);

        // Toggle all expando boxes
        var expandosOpen = false;
        $('.open-expandos').toggle(

            function () {
                $('.open-expandos').text('[-]');
                $('.expando-button.collapsed').click();
                expandosOpen = true;
            },

            function () {
                $('.open-expandos').text('[+]');
                $('.expando-button.expanded').click();
                expandosOpen = false;
            });

        // Open inline context
        $('.inline-content').click(function (e) {
                e.stopPropagation();
            });
        $('a.context').live('click', function (e) {
                $('html').one('click', function () {
                        $('.inline-content').hide();
                    });
                $('.inline-content').show().offset($(this).offset()).text('loading...').load(this.href + '&limit=5 .sitetable.nestedlisting');
                return false;
            });

        // Add history button to all users. 

        function addUserHistoryLink() {
            var userhistory = '<a href="javascript:;" class="user-history-button" title="view user history" target="_blank">H</a>';

            $(this).append('[' + userhistory + ']');
        }
        $('.thing .entry .userattrs').each(addUserHistoryLink);

        // Add ban button to all users. 

        function addUserBanLink() {
            if (!$(this).hasClass('ban-button')) {

                // Add the class so we don't add buttons twice.
                $(this).addClass('ban-button');

                // Add button.
                $(this).append('[<a href="javascript:void(0)" class="user-ban-button">B</a>]');
            }
        }
        $('.thing .entry .userattrs').each(addUserBanLink);

        //Process new things loaded by RES or flowwit.

        function processNewThings(things) {
            //add class to processed threads.
            $(things).addClass('mte-processed');

            $(things).prepend('<input type="checkbox" tabindex="2" style="margin:5px;float:left;"' + (allSelected ? ' checked' : '') + ' />')
                .find('.collapsed:visible a.expand:contains("[+]")').click().end()
                .find('.userattrs').each(addUserHistoryLink).end()
                .find('.userattrs').each(addUserBanLink)
                .filter('.comment').find('.flat-list.buttons:has( a:contains("parent"))').each(function () {
                    $(this).prepend('<li><a class="context" href="' + $(this).find('.first .bylink').attr('href') + '?context=2">context</a></li>');
                });
            if (expandosOpen) $(things).find('.expando-button.collapsed').click();
            if (!viewingspam) setThreshold(things);
        }

        // Add callbacks for flowwit script
        window.flowwit = window.flowwit || [];
        window.flowwit.push(function (things) {
                processNewThings(things);
            });

        //RES NER support.
        $('div.content').on('DOMNodeInserted', function (e) {

                // Not RES.
                if (e.target.className !== 'NERPageMarker') {
                    return;
                }

                // Wait for content to load.
                setTimeout(function () {
                        var things = $(".thing").not(".mte-processed");
                        processNewThings(things);
                    }, 1000);
            });

        // Remove rate limit for expandos,removing,approving
        var rate_limit = window.rate_limit;
        window.rate_limit = function (action) {
            if (action == 'expando' || action == 'remove' || action == 'approve') return !1;
            return rate_limit(action);
        };

        //User history button pressed
        var gettingUserdata = false;
        $('.user-history-button').live('click', function () {
                $('html').one('click', function () {
                        $('.inline-content').hide();
                        gettingUserdata = false;
                    });
                gettingUserdata = true;

                var author = $(this).parents('.tagline').find('.author').text(),
                    commentbody = '',
                    contentBox = $('.inline-content')
                        .show().offset($(this).offset())
                        .html('<div class="user-history"><a href="/user/' + author + '" target="_blank">' + author + '</a> <span class="karma" /> <a class="rts-report" href="javascript:;" data-commentbody="">Submit to RTS</a><div><br /><b>Submission history:</b></div><div class="table domain-table"><table><thead><tr><th>domain submitted from</th><th>count</th><th>ups</th><th>downs</th><th>score</th><th>%</th></tr></thead><tbody><tr><td colspan="6" class="error">loading...</td></tr></tbody></table></div><div class="table subreddit-table"><table><thead><tr><th>subreddit submitted to</th><th>count</th><th>ups</th><th>downs</th><th>score</th><th>%</th></tr></thead><tbody><tr><td colspan="6" class="error">loading...</td></tr></tbody></table></div></div>'),

                    domains = {}, domainslist = [],
                    domaintable = contentBox.find('.domain-table tbody'),
                    subreddits = {}, subredditlist = [],
                    subreddittable = contentBox.find('.subreddit-table tbody');

                // Show user's karma
                $.get('/user/' + author + '/about.json').success(function (d) {
                        contentBox.find('.karma').text('(' + d.data.link_karma + ' | ' + d.data.comment_karma + ')');
                    });

                // Get user's domain & subreddit submission history
                (function populateHistory(after) {
                        $.get('/user/' + author + '/submitted.json?limit=100&after=' + (after || ''))
                            .error(function () {
                                contentBox.find('.error').html('unable to load userdata</br>shadowbanned?');
                            })
                            .success(function (d) {

                                if (!gettingUserdata) return;
                                if (!d.data.children.length) return contentBox.find('.error').html('no submissions');

                                var after = d.data.after,
                                    commentbody = 'Recent Submission history for ' + author + ':\n\ndomain submitted from|count|ups|downs|score|%\n:-|-:|-:|-:|-:|-:';

                                for (i in d.data.children) {
                                    var data = d.data.children[i].data;

                                    if (!domains[data.domain]) {
                                        domains[data.domain] = {
                                            ups: 0,
                                            downs: 0,
                                            score: 0,
                                            count: 0
                                        };
                                        domainslist.push(data.domain);
                                    }

                                    domains[data.domain].ups += data.ups;
                                    domains[data.domain].downs += data.downs;
                                    domains[data.domain].score += data.score;
                                    domains[data.domain].count++;

                                    if (!subreddits[data.subreddit]) {
                                        subreddits[data.subreddit] = {
                                            ups: 0,
                                            downs: 0,
                                            score: 0,
                                            count: 0
                                        };
                                        subredditlist.push(data.subreddit);
                                    }
                                    subreddits[data.subreddit].ups += data.ups;
                                    subreddits[data.subreddit].downs += data.downs;
                                    subreddits[data.subreddit].score += data.score;
                                    subreddits[data.subreddit].count++;
                                }

                                domainslist.sort(function (a, b) {
                                        return domains[b].count - domains[a].count;
                                    });
                                domaintable.empty();

                                for (i in domainslist) {
                                    var dom = domainslist[i],
                                        n = domains[dom].count,
                                        u = domains[dom].ups,
                                        d = domains[dom].downs,
                                        s = domains[dom].score,
                                        url = '/search?q=%28and+site%3A%27' + dom + '%27+author%3A%27' + author + '%27+is_self%3A0+%29&restrict_sr=off&sort=new',
                                        match = dom.match(/^self.(\w+)$/);

                                    if (match) url = '/r/' + match[1] + '/search?q=%28and+author%3A%27' + author + '%27+is_self%3A1+%29&restrict_sr=on&sort=new';
                                    domaintable.append('<tr><td><a target="_blank" href="' + url + '" title="view links ' + author + ' recently submitted from \'' + dom + '\'">' + dom + '</a></td><td>' + n + '</td><td>' + u + '</td><td>' + d + '</td><td>' + s + '</td><td>' + Math.round(u / (u + d) * 100) + '%</td></tr>');

                                    if (i < 20) commentbody += '\n[' + dom + '](' + url + ')|' + n + '|' + u + '|' + d + '|' + s + '|' + Math.round(u / (u + d) * 100) + '%';
                                }
                                if (i >= 20) commentbody += '\n\n_^...and ^' + (domainslist.length - 20) + ' ^more_';

                                commentbody += '\n\nsubreddit submitted to|count|ups|downs|score|%\n:-|-:|-:|-:|-:|-:';

                                subredditlist.sort(function (a, b) {
                                        return subreddits[b].count - subreddits[a].count;
                                    });
                                subreddittable.empty();
                                for (i in subredditlist) {
                                    var sr = subredditlist[i],
                                        n = subreddits[sr].count,
                                        u = subreddits[sr].ups,
                                        d = subreddits[sr].downs,
                                        s = subreddits[sr].score,
                                        url = '/r/' + sr + '/search?q=author%3A%27' + author + '%27&restrict_sr=on&sort=new';

                                    subreddittable.append('<tr><td><a target="_blank" href="' + url + '" title="view links ' + author + ' recently submitted to /r/' + sr + '/">' + sr + '</a></td><td>' + n + '</td><td>' + u + '</td><td>' + d + '</td><td>' + s + '</td><td>' + Math.round(u / (u + d) * 100) + '%</td></tr>');

                                    if (i < 20) commentbody += '\n[' + sr + '](' + url + ')|' + n + '|' + u + '|' + d + '|' + s + '|' + Math.round(u / (u + d) * 100) + '%';
                                }
                                if (i >= 20) commentbody += '\n\n_^...and ^' + (subredditlist.length - 20) + ' ^more_';

                                $('.rts-report')
                                    .attr('data-commentbody', commentbody)
                                    .attr('data-author', author);

                                if (after) populateHistory(after);
                                else gettingUserdata = false;
                            });
                    })();
                return false;
            });

        // User ban button pressed. 

        function postbanlog(subreddit, author, reason) {
            var data = {
                subreddit: subreddit,
                author: author,
                title: 'banned',
                logsub: '',
                bantitle: '',
                logreason: '',
                url: 'http://www.reddit.com/user/' + author
            };

            if (notEnabled.indexOf(data.subreddit) != -1) return;

            // Get removal reasosn.
            getRemovalReasons(data, function (resp) {
                    data = resp;
                    console.log(data);

                    if (!data || !data.logsub) {
                        return;
                    } else if (reason == '' || reason == undefined || reason == null) {
                        alert('You did not give a reason for this ban.  You will need to create the log thread in /r/' + data.logsub + ' manually.');
                        return;
                    } else {
                        data.logreason = reason;
                        data.bantitle = data.bantitle.replace('{reason}', data.logreason);
                        data.bantitle = data.bantitle.replace('{title}', data.title);
                        data.bantitle = data.bantitle.replace('{author}', data.author);
                        data.bantitle = data.bantitle.replace('{subreddit}', data.subreddit);
                        console.log(data);

                        $.post('/api/submit', {
                                kind: 'link',
                                resubmit: 'true',
                                url: data.url,
                                uh: reddit.modhash,
                                title: removequotes(data.bantitle),
                                sr: data.logsub,
                                api_type: 'json'
                            })
                            .done(function (data) {
                                var removalid = data.json.data.url;
                                removalid = removalid.match(/http:\/\/www.reddit.com\/r\/.+?\/comments\/([^\/]+?)\/.*/);
                                removalid = 't3_' + removalid[1];

                                $.post('/api/approve', {
                                        id: removalid,
                                        uh: reddit.modhash
                                    });
                                return;
                            });
                    }
                });
        }

        function getUserAndSub(thing) {
            var user = $(thing).find('.author:first').text(),
                currentsub = $('.titlebox h1.redditname a').text();

            // Try again.
            if (!user) {
                user = $(thing).closest('.entry').find('.author:first').text();
            }

            if (!currentsub) {
                currentsub = $(thing).closest('.entry').find('.subreddit').text();
            }

            if (!currentsub) {
                currentsub = $(thing).closest('.thing').find('.subreddit').text();
            }

            // If we still don't have a sub, we're in mod mail
            if (!currentsub) {
                currentsub = $(thing).closest('.entry').find('.head a:last').text().replace('/r/', '').replace('/', '').trim();
            }

            return {
                'currentsub': currentsub,
                'user': user
            };
        }

        $('.user-ban-button').live('click', function (e) {
                var banbutton = e.target,
                    info = getUserAndSub(this),
                    currentsub = info.currentsub,
                    user = info.user;

                // No such luck.
                if (!user || user === '[deleted]' || !currentsub) {
                    $(banbutton).text('E');
                    $(banbutton).css('color', 'red');
                    return;
                }

                var confirmban = confirm("Are you sure you want to ban /u/" + user + " from /r/" + currentsub + "?");
                var reason = prompt("What is the reason for banning this user? (leave blank for none)", "");
                if (confirmban) {
                    postbanlog(currentsub, user, reason);
                    $.post('/api/friend', {
                            uh: reddit.modhash,
                            type: 'banned',
                            name: user,
                            r: currentsub,
                            note: (reason == null) ? '' : reason,
                            api_type: 'json'
                        })
                        .done(function (data) {
                            alert(user + " has been banned from/r/" + currentsub);
                        });
                }
            });

        // RTS button pressed
        $('.inline-content').delegate('.rts-report', 'click', function () {
                var rtsLink = this,
                    author = rtsLink.getAttribute('data-author'),
                    commentbody = rtsLink.getAttribute('data-commentbody');

                rtsLink.textContent = 'submitting...';
                rtsLink.className = '.rts-report-clicked';

                //Submit to RTS
                $.post('/api/submit', {
                        uh: reddit.modhash,
                        title: 'Overview for ' + author,
                        kind: 'link',
                        url: 'http://www.reddit.com/user/' + author,
                        sr: 'reportthespammers',
                        api_type: 'json'
                    })
                    .error(function () {
                        rtsLink.innerHTML = '<span class="error" style="font-size:x-small">an error occured</error>';
                    })
                    .success(function (submission) {
                        if (submission.json.errors.length) {
                            rtsLink.innerHTML = '<span class="error" style="font-size:x-small">' + submission.json.errors[0][1] + '</error>';
                            if (submission.json.errors[0][0] == 'ALREADY_SUB') rtsLink.href = 'http://www.reddit.com/r/reportthespammers/search?q=http%3A%2F%2Fwww.reddit.com%2Fuser%2F' + author + '&restrict_sr=on';
                            return;
                        }

                        // Post stats as a comment.
                        if (!commentbody.length) return;
                        $.post('/api/comment', {
                                uh: reddit.modhash,
                                thing_id: submission.json.data.name,
                                text: commentbody,
                                api_type: 'json'
                            })
                            .error(function (e) {
                                rtsLink.innerHTML = '<span class="error" style="font-size:x-small">an error occured</error>';
                            })
                            .success(function (comment) {
                                if (comment.json.errors.length) return rtsLink.innerHTML = '<span class="error" style="font-size:x-small">' + comment.json.errors[1] + '</error>';
                                rtsLink.textContent = 'reported';
                                rtsLink.href = submission.json.data.url;
                                rtsLink.className = '';
                            });
                    });
            });
    }

    // Add mod tools or mod tools toggle button if applicable
    if (location.pathname.match(/\/about\/(?:reports|modqueue|spam|unmoderated|trials)\/?/)) addModtools();
    if (($('body').hasClass('listing-page') || $('body').hasClass('comments-page')) && (!reddit.post_site || $('body.moderator').length)) $('<li><a href="javascript:;" accesskey="M" class="modtools-on">modtools</a></li>').appendTo('.tabmenu').click(addModtools);

    // Check if we're viewing a subreddit's reports/spam/modqueue page
    if (location.pathname.match(/^\/r\/\w+\/about\/(?:reports|modqueue|spam|unmoderated)\/?$/)) {
        // Reset the modqueue cache timer for this sr
        var subdata = JSON.parse(localStorage.getItem('mq-' + reddit.logged + '-' + reddit.post_site)) || [0, 0];
        localStorage.setItem('mq-' + reddit.logged + '-' + reddit.post_site, '[' + subdata[0] + ',' + 0 + ']');
    }

    // Check if we're viewing an /r/mod/ fakereddit page
    if (location.pathname.match(/^\/r\/mod/)) {
        var now = new Date().valueOf(),
            subs = {},
            delay = 0;

        // Update modqueue items count
        var modSubs = [];
        $('.subscription-box a.title').each(function () {
                var elem = $(this),
                    sr = elem.text(),
                    data = JSON.parse(localStorage.getItem('mq-' + reddit.logged + '-' + sr)) || [0, 0];
                modSubs.push(sr);

                // Update count and re-cache data if more than an hour old.
                elem.parent().append('<a href="/r/' + sr + '/about/modqueue" count="' + data[0] + '">' + data[0] + '</a>');
                if (now > data[1] + 3600000) setTimeout(updateModqueueCount.bind(null, sr), delay += 500);
            });
        localStorage.setItem('mod-' + reddit.logged, JSON.stringify(modSubs));

        //  Causes mod pages to take forever to load.  Not sure it has much value.
        //  Need to establish the sort order and then only sort them only once.

        function sortSubreddits() {
            var subs = $('.subscription-box li').sort(function (a, b) {
                    return b.lastChild.textContent - a.lastChild.textContent || (+(a.firstChild.nextSibling.textContent.toLowerCase() > b.firstChild.nextSibling.textContent.toLowerCase())) || -1;
                });
            $('.subscription-box').empty().append(subs);
        }
        //sortSubreddits(); //disabled.

        function updateModqueueCount(sr) {
            $.get('/r/' + sr + '/about/modqueue.json?limit=100').success(function (d) {
                    localStorage.setItem('mq-' + reddit.logged + '-' + sr, '[' + d.data.children.length + ',' + new Date().valueOf() + ']');
                    $('.subscription-box a[href$="/r/' + sr + '/about/modqueue"]').text(d.data.children.length).attr('count', d.data.children.length);
                    //sortSubreddits(); //disabled
                });
        }
    }
}

// Add script to the page
document.addEventListener('DOMContentLoaded', function (e) {
        var s = document.createElement('script');
        s.textContent = "(" + modtools.toString() + ')();';
        document.head.appendChild(s)
    });

// Add CSS
(function addcss() {
        if (!document.head) return setTimeout(addcss);

        // Add to all pages
        var css = '\
        .reason-popup {;padding:10px 15px;background-color: rgba(250, 250, 250, 0.84);;border: 0px;-moz-border-radius: 0px;-webkit-border-radius: 0px;border-radius: 0px;position:fixed; top:0px; left:0px; right:0px; bottom:0px; overflow:auto; z-index:10000} \
        .reason-popup .right{ float:right }\
        .reason-popup .status{ display:none; }\
        .reason-popup input,.reason-popup select,.reason-popup textarea{ font-size:x-small;border:1px solid #ccc;background-color:#fafafa }\
        .reason-popup textarea{ min-width:400px}\
        .reason-popup tbody tr{ vertical-align:top; border:1px solid rgb(187, 187, 187);display:block;margin-bottom: 5px;font-size: 115%;font-family: "Segoe UI", Frutiger, "Frutiger Linotype", "Dejavu Sans", "Helvetica Neue", Arial, sans-serif;padding:5px }\
        .reason-popup th{ padding-right:10px }\
        .reason-popup .buttons{ padding-top:10px }\
		.reason-popup .reason-popup-content { position: relative; top:40px; max-width: 1000px; margin: 0 auto; padding: 10px; background-color: white; border: solid 1px gray; }\
		.reason-popup .reason-popup-content span p { padding: 3px;}\
        \
        .choice.dashed{border-top:1px dashed}\
        .thing.approved{background-color:paleGreen}\
        .thing.removed{background-color:lightgray}\
        .thing.spammed{background-color:Tomato}\
        .thing.flaired{background-color:PaleTurquoise}\
        .pretty-button.inoffensive{background-position:0 -240px;background-image:url(http://www.redditstatic.com/sprite-reddit.rQ7y8qN-wzQ.png);background-repeat:repeat; -moz-border-radius: 0px;-webkit-border-radius: 0px;border-radius: 0px;}\
        .pretty-button.inoffensive.pressed{background-position:0 -200px!important}\
        .thing+input[type="checkbox"]:focus{outline:blue solid 1px}\
        \
        .user-history{ padding:10px }\
        .user-history td{ border:1px dotted lightgray;border-bottom:none }\
        .user-history th{ border:1px solid lightgray;border-top:none;font-weight:bold }\
        .user-history th,.user-history td{ padding:5px; border-right:none }\
        .user-history table{ width:100% }\
        .user-history .table{ margin:10px; max-height: 300px;overflow-x: hidden;overflow-y: scroll;border-bottom: 1px dotted lightgray;border-top: 1px solid lightgray; }\
        .user-history .table .error{ text-align:center }\
        .rts-report,.rts-report-clicked{ font-weight:bold;font-size:x-small; float:right }';

        // Add to mod pages only
        if (location.pathname.match(/(^\/r\/mod\/)|(\/about\/(?:reports|modqueue|spam|unmoderated))/)) css += '\
            .subscription-box .option.active{font-size:0;display:inline-block!important;width:10px;height:10px;padding:2px}\
            .subscription-box .option.add{background-color:#7BB850;background-position:3px 3px;background-repeat: no-repeat;background-image:url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAkAAAAHCAIAAABV+fA3AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABrSURBVBhXY6zeEcAAATwx+dYW147m7P4CFWD6/58BjoAAmcvEyPgfhkByjIz/4CIMVYfXvPqPCZ7sPxzAWLnVH6QeCHhiC+0srh7K2vUFbALIvr//oAhsIUgPTISJ4R8DFP0FKwaSEO4/BgA35Fw9UX68TAAAAABJRU5ErkJggg==")}\
            .subscription-box .option.remove{background-color:#C85F63;background-position:3px 5px;background-repeat: no-repeat;background-image:url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAcAAAACCAIAAAAb/VE3AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAdSURBVBhXYzyXmMoABoxg8j+YZDg/8/x/NPB8KwA1RRZZO8v/6AAAAABJRU5ErkJggg==")}\
            .subscription-box ul{clear:both}\
            .subscription-box li {margin-bottom:2px}\
            .subscription-box li a:last-child{float:right}\
            .subscription-box li a[count="100"]:after{content:"+"}\
            .thing{overflow:hidden;margin-left:0!important;padding-left:0px!important}\
            .midcol{margin-left:0!important;width:auto!important}\
            ,a.pretty-button:focus{box-shadow: 0 0 5px rgba(0,0,255,1);-webkit-box-shadow: 0 0 5px rgba(0,0,255,1);-moz-box-shadow: 0 0 5px rgba(0,0,255,1)}\
            .thing{margin-bottom:0;padding:4px 0}';

        s = document.createElement('style');
        s.type = "text/css";
        s.textContent = css;
        document.head.appendChild(s);
    })();
