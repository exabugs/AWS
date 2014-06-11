/**
 * ドキュメント
 * http://baalzephon.no-ip.org/tech/index.php?JavaScript%2FjQuery%2FDataTables
 */
$(document).ready(function () {
  var myTable = $('#table_id').dataTable({
    bAutoWidth: false,
    aaSorting: [
      [ 1, "desc" ]
    ],
    aoColumns: [
      { sWidth: "10px", mData: "_check", sClass: "center", bSortable: false },
//      { sWidth: "200px", mData: "_id", sClass: "center mono" },
      { sWidth: "150px", mData: "uploadDate", sClass: "center" },

      { sWidth: "30px", mData: "direct", sClass: "center", bSortable: false },

      { sWidth: "30px", mData: "proxy_revalidate", sClass: "center", bSortable: false },
      { sWidth: "30px", mData: "must_revalidate", sClass: "center", bSortable: false },
      { sWidth: "30px", mData: "no_cache", sClass: "center", bSortable: false },
      { sWidth: "30px", mData: "no_store", sClass: "center", bSortable: false },
      { sWidth: "30px", mData: "no_transform", sClass: "center", bSortable: false },
      { sWidth: "30px", mData: "public", sClass: "center", bSortable: false },
      { sWidth: "30px", mData: "private", sClass: "center", bSortable: false },
      { sWidth: "30px", mData: "max_age", sClass: "center", bSortable: false },

      { sWidth: "100px", mData: "contentType", sClass: "mono" },
      { sWidth: "16px", mData: "length", sClass: "right" },
      { sWidth: "10px", mData: "_play", sClass: "center", bSortable: false, sDefaultContent: "" },
      {                  mData: "filename" },
      { sWidth: "10px", mData: "_delete", sClass: "center", bSortable: false }
    ],
    sPaginationType: "full_numbers",
    bServerSide: true,
    bDeferRender: true,
    sAjaxSource: "/files",
    sAjaxDataProp: "items",
    fnServerParams: function (aoData) {
      //alert(JSON.stringify(aoData));
      _.each(aoData, function (param) {
        if ("sSearch" === param.name) {
          aoData.push({"name": "keyword", "value": param.value});
        }
      });
      aoData.push(
        {"name": "id", "value": "1"}
      );
    },
    fnServerData: function (sSource, aoData, fnCallback, oSettings) {
      oSettings.jqXHR = $.ajax({
        url: sSource,
        type: "GET",
        data: aoData,
        dataType: 'json'
      })

        .pipe(function (json) {
          json.items = $.map(json.items, function (item, index) {
            item.filename = '<a href="' + item._id + '">' + item.filename + '</a>';
            if (item.contentType.indexOf('video/') === 0) {
              item._play = '<a href="' + item._id + '/video/"><img class="icon" src="/images/play.png"/></a>';
            }
            if (item.uploadDate) {
              //item.uploadDate = (moment(item.uploadDate)).format('YYYY-MM-DD HH:mm:ss');
              item.uploadDate = '<span name="update_test" _id="' + item._id + '">' + (moment(item.uploadDate)).format('YYYY-MM-DD HH:mm:ss') + '</span>';
            }
            if (item.length) {
              item.length = numeral(item.length).format('0,0');
            }
            item._check = '<input type="checkbox" />';
            item._delete = '<img _id="' + item._id + '" name="delete" class="icon" src="/images/delete.png"/>';

            item.direct = checkbox(item._id, item, 'direct');

            item.proxy_revalidate = checkbox(item._id, item.cache, 'proxy_revalidate');
            item.must_revalidate = checkbox(item._id, item.cache, 'must_revalidate');
            item.no_cache = checkbox(item._id, item.cache, 'no_cache');
            item.no_store = checkbox(item._id, item.cache, 'no_store');
            item.no_transform = checkbox(item._id, item.cache, 'no_transform');
            item.public = checkbox(item._id, item.cache, 'public');
            item.private = checkbox(item._id, item.cache, 'private');
            item.max_age = checkbox(item._id, item.cache, 'max_age');

            return item;
          });

          return json;
        })
        .done(fnCallback);
    }
  });

  function checkbox(_id, item, name) {
    var val = (item === undefined || item[name] === undefined) ? false : item[name];
    var params = [];
    params.push('type="checkbox"');
    params.push('_id="' + _id + '"');
    params.push('name="' + name + '"');
    if (val === true) {
      params.push('checked="checked"');
    }
    return '<input ' + params.join(' ') + ' />';
  }

  // jQuery DataTables: Delay search until 3 characters been typed OR a button clicked
  // http://stackoverflow.com/questions/5548893/jquery-datatables-delay-search-until-3-characters-been-typed-or-a-button-clicke
  $('.dataTables_filter input')
    .unbind('keyup')
    .bind('keyup', function (e) {
      if (e.keyCode != 13) return;
      myTable.fnFilter($(this).val());
    });

  function refresh() {
    var keyword = ($('.dataTables_filter input').val());
    myTable.fnFilter(keyword);
  }


  /**
   * Delete
   */
  $("#table_id").bind("click", "a", function (event) {
    var _id = $(event.target).attr("_id");
    if ("delete" === $(event.target).attr("name")) {
      if (window.confirm('Are you ready?')) {
        $.ajax({
          url: '/files/' + _id,
          type: 'DELETE',
          success: function (result) {
            refresh();
          }
        });
      }
    }
    if ("update_test" === $(event.target).attr("name")) {
      $.ajax({
        url: '/files/update_test/' + _id,
        type: 'GET',
        success: function (result) {
          refresh();
        }
      });
    }

    put_checkbox(event, _id, 'direct');

    put_checkbox(event, _id, 'public');
    put_checkbox(event, _id, 'private');
    put_checkbox(event, _id, 'proxy_revalidate');
    put_checkbox(event, _id, 'must_revalidate');
    put_checkbox(event, _id, 'no_cache');
    put_checkbox(event, _id, 'no_store');
    put_checkbox(event, _id, 'no_transform');
    put_checkbox(event, _id, 'max_age');
  });

  function put_checkbox(event, _id, name) {
    if (name === $(event.target).attr("name")) {
      var data = {};
      data[name] = $(event.target).attr("checked") === undefined ? false : true;
      $.ajax({
        url: '/files/' + _id,
        type: 'PUT',
        data: data,
        success: function (result) {
          refresh();
        }
      });
    }
  }

  /**
   * Upload
   *
   * https://github.com/tadruj/s3upload-coffee-javascript/blob/master/s3upload.js
   */
  $('#submit_id').bind('click', function (e) {

    var file = $('#file_id')[0].files[0];

    if (!file) return;

    $.getJSON(
      '/files/getSignedUrl',
      {
        method: 'PUT',
        contentType: file.type,
        length: file.size,
        filename: file.name
      }
      , function (data, status) {

        var xhr = new XMLHttpRequest();
        xhr.open('PUT', data.url, true);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.onreadystatechange = statechange;
        xhr.upload.onprogress = progress;
        xhr.send(file);

        function progress(e) {
          // http://www.buildinsider.net/web/jqueryuiref/0022
          $('#progress').show();
          $('#progress').progressbar({
            value: e.loaded,
            max: e.total
          });
        }

        function statechange() {
          if ((xhr.readyState == 4) && (xhr.status == 200)) {
            $('#progress').hide();
            refresh();
            $.getJSON(
                '/files/aftertreat/' + data.key,
              {}
            );
          }
        }

      });
  });

});
