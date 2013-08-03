// All Tomorrow's Parties -- client

Meteor.subscribe("directory");
Meteor.subscribe("parties");

// Attending
var attending = function (party) {
  return (_.groupBy(party.rsvps, 'rsvp').yes || []).length;
};

// If no party selected, select one.
Meteor.startup(function () {
  Meteor.autorun(function () {
    if (! Session.get("Date")) {
      Session.set("Date", new Date().toDateString());
    }
    if (! Session.get("selected")) {
      var party = Parties.findOne();
      if (party)
        Session.set("selected", party._id);
    }
  });
});

///////////////////////////////////////////////////////////////////////////////
// Party details sidebar

Template.details.party = function () {
  return Parties.findOne(Session.get("selected"));
};

Template.details.anyParties = function () {
  return Parties.find().count() > 0;
};

Template.details.creatorName = function () {
  var owner = Meteor.users.findOne(this.owner);
  if (owner._id === Meteor.userId())
    return "me";
  return displayName(owner);
};

Template.details.canRemove = function () {
  return this.owner === Meteor.userId() && attending(this) === 0;
};

Template.details.maybeChosen = function (what) {
  var myRsvp = _.find(this.rsvps, function (r) {
    return r.user === Meteor.userId();
  }) || {};

  return what == myRsvp.rsvp ? "chosen btn-inverse" : "";
};


Template.details.itemsForParty = function(){
  var party = Parties.findOne(Session.get("selected"));
  if (! party)
    return []; // party hasn't loaded yet
  return party.items;
}
  
Template.details.DayString = function(){
  var D = new Date(Session.get("Date"));
  return "Items for " + Months[D.getMonth()] + ", " + D.getDate();
}


Template.details.events({
  'click .rsvp_yes': function () {
    Meteor.call("rsvp", Session.get("selected"), "yes");
    return false;
  },
  'click .rsvp_maybe': function () {
    Meteor.call("rsvp", Session.get("selected"), "maybe");
    return false;
  },
  'click .rsvp_no': function () {
    Meteor.call("rsvp", Session.get("selected"), "no");
    return false;
  },
  'click .invite': function () {
    openInviteDialog();
    return false;
  },
  'click .remove': function () {
    Parties.remove(this._id);
    return false;
  },
  'click .create': function () {
    if (! Meteor.userId()) // must be logged in to create events
      return;
    var date = Session.get("Date");
    openCreateDialog(1, 1, date);
  },
  'click #ItemsButton': function () {
    var emptyText='New item text(click to edit)';
    Meteor.call("item", Session.get("selected"), emptyText);
    return false;
  },
});

///////////////////////////////////////////////////////////////////////////////
// Party attendance widget

Template.attendance.rsvpName = function () {
  var user = Meteor.users.findOne(this.user);
  return displayName(user);
};

Template.attendance.outstandingInvitations = function () {
  var party = Parties.findOne(this._id);
  return Meteor.users.find({$and: [
    {_id: {$in: party.invited}}, // they're invited
    {_id: {$nin: _.pluck(party.rsvps, 'user')}} // but haven't RSVP'd
  ]});
};

Template.attendance.invitationName = function () {
  return displayName(this);
};

Template.attendance.rsvpIs = function (what) {
  return this.rsvp === what;
};

Template.attendance.nobody = function () {
  return ! this.public && (this.rsvps.length + this.invited.length === 0);
};

Template.attendance.canInvite = function () {
  return ! this.public && this.owner === Meteor.userId();
};

///////////////////////////////////////////////////////////////////////////////
// Calendar display

var Months = new Array("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December");
var adjustMonth = function (Num){
  var D = new Date(Session.get("Date"));
  if(D.getDate() > 28){ D.setDate(28); }
  D.setMonth(D.getMonth()+Num);
  Session.set("Date", D.toDateString());  
}

Template.calendar.DateString = function(){
  var D = new Date(Session.get("Date"));
  return Months[D.getMonth()] + ", " + D.getFullYear();
}

Template.calendar.GetDays = function(){
  var S = new Date(Session.get("Date")),
      start = new Date(S.getFullYear(), S.getMonth(),0) 
      end = new Date(S.getFullYear(), S.getMonth()+1, 0),
      Days = new Array({Number: "Su"}, {Number: "Mo"}, {Number: "Tu"}, {Number: "We"}, {Number: "Th"}, {Number: "Fr"}, {Number: "Sa"}),
      partyDays = Parties.find({date:{$gte:start, $lte:end}}).map(function(party){
        var d = new Date(party.date),
            o = { 'day': d.getDate(), 'id' : party._id};
            // o = {d.getDate().toDateString : party._id};
        return o;
      });

  for(var i = 0; i<end.getDay(); i++){ Days.push({Number : "_"}); }
  for(var i = 0; i<end.getDate(); i++)
  {
    if(S.getDate() == i+1){ 
      if ( _.contains(_.pluck(partyDays, 'day'), i+1) ) { 
        Days.push({'Number' : i+1, 'Class': " EventDaySelected",  'id': _.pluck(partyDays, 'id')[_.pluck(partyDays, 'day').indexOf(i+1)] }); 
      } 
      else Days.push({'Number' : i+1, 'Class': " DaySelected"}); 
    }
    else if ( _.contains(_.pluck(partyDays, 'day'), i+1) ) { 
      Days.push({'Number' : i+1, 'Class': " DayClick Event",  'id': _.pluck(partyDays, 'id')[_.pluck(partyDays, 'day').indexOf(i+1)] }); 
    }
    else { Days.push({'Number' : i+1, 'Class': " DayClick" }); }
  }
  return Days;
}

Template.calendar.events({
  'click #NextMonth': function(){ adjustMonth(1);  },
  'click #LastMonth': function(){ adjustMonth(-1); },
  'click .DayClick':function(event){
    var D = new Date(Session.get("Date"));
    D.setDate(this.Number);
    Session.set("Date", D.toDateString());
    if(event.currentTarget.id !='')
      Session.set("selected", event.currentTarget.id);
  }
});


///////////////////////////////////////////////////////////////////////////////
// Map display

// Use jquery to get the position clicked relative to the map element.
var coordsRelativeToElement = function (element, event) {
  var offset = $(element).offset();
  var x = event.pageX - offset.left;
  var y = event.pageY - offset.top;
  return { x: x, y: y };
};

Template.map.events({
  'mousedown circle, mousedown text': function (event, template) {
    Session.set("selected", event.currentTarget.id);
  },
  'dblclick .map': function (event, template) {
    if (! Meteor.userId()) // must be logged in to create events
      return;
    var coords = coordsRelativeToElement(event.currentTarget, event);
    openCreateDialog(coords.x / 500, coords.y / 500);
  }
});

Template.map.rendered = function () {
  var self = this;
  self.node = self.find("svg");

  if (! self.handle) {
    self.handle = Meteor.autorun(function () {
      var selected = Session.get('selected');
      var selectedParty = selected && Parties.findOne(selected);
      var radius = function (party) {
        return 10 + Math.sqrt(attending(party)) * 10;
      };

      // Draw a circle for each party
      var updateCircles = function (group) {
        group.attr("id", function (party) { return party._id; })
        .attr("cx", function (party) { return party.x * 500; })
        .attr("cy", function (party) { return party.y * 500; })
        .attr("r", radius)
        .attr("class", function (party) {
          return party.public ? "public" : "private";
        })
        .style('opacity', function (party) {
          return selected === party._id ? 1 : 0.6;
        });
      };

      var circles = d3.select(self.node).select(".circles").selectAll("circle")
        .data(Parties.find().fetch(), function (party) { return party._id; });

      updateCircles(circles.enter().append("circle"));
      updateCircles(circles.transition().duration(250).ease("cubic-out"));
      circles.exit().transition().duration(250).attr("r", 0).remove();

      // Label each with the current attendance count
      var updateLabels = function (group) {
        group.attr("id", function (party) { return party._id; })
        .text(function (party) {return attending(party) || '';})
        .attr("x", function (party) { return party.x * 500; })
        .attr("y", function (party) { return party.y * 500 + radius(party)/2 })
        .style('font-size', function (party) {
          return radius(party) * 1.25 + "px";
        });
      };

      var labels = d3.select(self.node).select(".labels").selectAll("text")
        .data(Parties.find().fetch(), function (party) { return party._id; });

      updateLabels(labels.enter().append("text"));
      updateLabels(labels.transition().duration(250).ease("cubic-out"));
      labels.exit().remove();

      // Draw a dashed circle around the currently selected party, if any
      var callout = d3.select(self.node).select("circle.callout")
        .transition().duration(250).ease("cubic-out");
      if (selectedParty)
        callout.attr("cx", selectedParty.x * 500)
        .attr("cy", selectedParty.y * 500)
        .attr("r", radius(selectedParty) + 10)
        .attr("class", "callout")
        .attr("display", '');
      else
        callout.attr("display", 'none');
    });
  }
};

Template.map.destroyed = function () {
  this.handle && this.handle.stop();
};

///////////////////////////////////////////////////////////////////////////////
// Create Party dialog

var openCreateDialog = function (x, y, date) {
  Session.set("createCoords", {x: x, y: y});
  Session.set("createError", null);
  Session.set("showCreateDialog", true);
};

Template.page.showCreateDialog = function () {
  return Session.get("showCreateDialog");
};

Template.createDialog.events({
  'click .save': function (event, template) {
    var title = template.find(".title").value;
    var description = template.find(".description").value;
    var public = ! template.find(".private").checked;
    var coords = Session.get("createCoords");
    var date = new Date(Session.get("Date"));

    if (title.length && description.length) {
      Meteor.call('createParty', {
        title: title,
        description: description,
        x: coords.x,
        y: coords.y,
        date: date,
        public: public
      }, function (error, party) {
        if (! error) {
          Session.set("selected", party);
          if (! public && Meteor.users.find().count() > 1)
            openInviteDialog();
        }
      });
      Session.set("showCreateDialog", false);
    } else {
      Session.set("createError",
                  "It needs a title and a description, or why bother?");
    }
  },

  'click .cancel': function () {
    Session.set("showCreateDialog", false);
  }
});

Template.createDialog.error = function () {
  return Session.get("createError");
};

Template.createDialog.date = function () {
  return Session.get("Date");
};

///////////////////////////////////////////////////////////////////////////////
// Invite dialog

var openInviteDialog = function () {
  Session.set("showInviteDialog", true);
};

Template.page.showInviteDialog = function () {
  return Session.get("showInviteDialog");
};

Template.inviteDialog.events({
  'click .invite': function (event, template) {
    Meteor.call('invite', Session.get("selected"), this._id);
  },
  'click .done': function (event, template) {
    Session.set("showInviteDialog", false);
    return false;
  }
});

Template.inviteDialog.uninvited = function () {
  var party = Parties.findOne(Session.get("selected"));
  if (! party)
    return []; // party hasn't loaded yet
  return Meteor.users.find({$nor: [{_id: {$in: party.invited}},
                                   {_id: party.owner}]});
};

Template.inviteDialog.displayName = function () {
  return displayName(this);
};
